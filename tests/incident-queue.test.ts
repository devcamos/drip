import { afterEach, beforeEach, expect, it, vi } from "vitest";
const broker = vi.hoisted(() => ({ send: vi.fn(), after: vi.fn(), tasks: [] as Array<() => Promise<void>> }));
vi.mock("@vercel/queue", () => ({ QueueClient: class { send = broker.send; } }));
vi.mock("next/server", () => ({ after: broker.after }));
import { publishIncident, scheduleIncident } from "../server/incident-queue";
import { incidentFor, verifiedIncident } from "../server/incidents";
const event = () => incidentFor("cloud", 503, crypto.randomUUID(), "database_unavailable")!;
beforeEach(() => {
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "true"); vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", "synthetic-signing-key-not-real-12345");
  vi.stubEnv("VERCEL_ENV", "preview"); broker.tasks.length = 0; broker.after.mockReset().mockImplementation(task => broker.tasks.push(task));
  broker.send.mockReset().mockResolvedValue({ messageId: "synthetic" }); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("runs delivery after the response and publishes a signed, deduplicated, retained event", async () => {
  const value = event(); scheduleIncident(value);
  expect(broker.send).not.toHaveBeenCalled(); expect(broker.tasks).toHaveLength(1);
  await broker.tasks[0]();
  expect(broker.send).toHaveBeenCalledOnce(); const [topic, signed, options] = broker.send.mock.calls[0];
  expect(topic).toBe("drip-incidents"); expect(verifiedIncident(signed)).toEqual(value);
  expect(options).toMatchObject({ retentionSeconds: 604800, idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
});
it("retries an uncertain queue acknowledgement using the same event and idempotency key", async () => {
  broker.send.mockRejectedValueOnce(new Error("private transport")); await publishIncident(event());
  expect(broker.send).toHaveBeenCalledTimes(2); expect(broker.send.mock.calls[0]).toEqual(broker.send.mock.calls[1]);
});
it("records failed publishing without propagating it to the user response", async () => {
  broker.send.mockRejectedValue(new Error("private token")); const value = event(); scheduleIncident(value); await broker.tasks[0]();
  expect(broker.send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toEqual({ app: "drip", event: "incident_pipeline_failed", stage: "publish", requestId: value.requestId });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
});
it("requires explicit enablement and tolerates a missing request lifecycle", () => {
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "false"); scheduleIncident(event()); expect(broker.after).not.toHaveBeenCalled();
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "true"); broker.after.mockImplementation(() => { throw new Error("private lifecycle"); });
  expect(() => scheduleIncident(event())).not.toThrow(); expect(console.error).toHaveBeenCalledOnce();
});
it("does not publish without a signing credential", async () => {
  vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", ""); scheduleIncident(event()); await broker.tasks[0]();
  expect(broker.send).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalledOnce();
});
