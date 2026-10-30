import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { incidentFor, incidentKey, signIncident, verifiedIncident, pipelineFailure } from "../server/incidents";
const reference = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", "synthetic-signing-key-not-real-12345"); vi.stubEnv("VERCEL_ENV", "preview"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const event = () => incidentFor("auth", 503, reference, "database_unavailable", new Request("https://drip.example/api/auth/private-person?password=private"))!;

it("keeps only allowlisted routes and release metadata and excludes client data", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "private-invalid-release"); vi.stubEnv("VERCEL_DEPLOYMENT_ID", "private-invalid-id");
  expect(event()).toMatchObject({ route: "/api/auth/[...all]", environment: "preview", release: "unknown", deployment: "local" });
  expect(JSON.stringify(event())).not.toMatch(/private|password/);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40)); vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_SYNTHETICTESTONLY");
  expect(event()).toMatchObject({ release: "a".repeat(40), deployment: "dpl_SYNTHETICTESTONLY" });
  for (const [operation, route] of [["cloud", "/api/cloud"], ["cloud.status", "/api/cloud/status"], ["recovery", "/api/recovery-codes"]] as const) expect(incidentFor(operation, 500, reference, "unexpected")?.route).toBe(route);
  expect(incidentFor("storage.open", 503, reference, "unexpected")).toBeUndefined();
  expect(incidentFor("auth", 499, reference, "unexpected")).toBeUndefined();
  expect(incidentFor("auth", 600, reference, "unexpected")).toBeUndefined();
  expect(incidentFor("auth", 503, "private", "unexpected")).toBeUndefined();
});
it("requires an untampered signed event from this environment without unknown properties", () => {
  const value = event(); const signed = signIncident(value);
  expect(verifiedIncident(signed)).toEqual(value);
  for (const changed of [{ ...signed, signature: "0".repeat(64) }, { ...signed, incident: { ...value, status: 500 } }, { ...signed, private: "secret" }, { ...signed, incident: { ...value, private: "secret" } }, null]) expect(() => verifiedIncident(changed)).toThrow(/Invalid/);
  vi.stubEnv("VERCEL_ENV", "production"); expect(() => verifiedIncident(signed)).toThrow(/environment/);
  vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", "short"); expect(() => signIncident(value)).toThrow(/not configured/);
});
it("rejects stale or future signed payloads and deduplicates occurrences across request IDs", () => {
  const value = { ...event(), occurredAt: "2026-10-24T01:50:01.000Z" };
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-24T01:50:30.000Z"));
  const sameIssue = { ...value, occurredAt: "2026-10-24T01:54:59.000Z", requestId: crypto.randomUUID() };
  expect(incidentKey(value)).toBe(incidentKey(sameIssue));
  expect(incidentKey(value)).not.toBe(incidentKey({ ...value, occurredAt: "2026-10-24T01:55:00.000Z" }));
  expect(incidentKey(value)).not.toBe(incidentKey({ ...value, status: 500 }));
  expect(() => verifiedIncident(signIncident({ ...value, occurredAt: "2026-10-24T02:00:00.000Z" }))).toThrow(/Expired/);
  expect(() => verifiedIncident(signIncident({ ...value, occurredAt: "2026-10-01T01:50:00.000Z" }))).toThrow(/Expired/);
});
it("does not break when fallback logging fails or a reference is untrusted", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  pipelineFailure("publish", "private"); expect(JSON.stringify(output.mock.calls)).not.toContain("private");
  output.mockImplementation(() => { throw new Error("broken console"); }); expect(() => pipelineFailure("schedule", reference)).not.toThrow();
});
