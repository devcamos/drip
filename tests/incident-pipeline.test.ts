import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ send: vi.fn(), after: vi.fn(), backend: vi.fn(), jobs: [] as Array<() => Promise<void>> }));
vi.mock("next/server", () => ({ after: runtime.after }));
vi.mock("../server/auth", () => ({ cloudConfigured: () => true, getAuth: () => ({ handler: runtime.backend }) }));
vi.mock("@vercel/queue", () => ({ QueueClient: class {
  send = runtime.send;
  handleCallback(handler: (value: unknown) => Promise<void>) {
    return async (request: Request) => {
      try { await handler(await request.json()); return Response.json({ status: "success" }); }
      catch { return Response.json({ status: "failed" }, { status: 500 }); }
    };
  }
} }));
import { GET as auth } from "../app/api/auth/[...all]/route";
import { POST as consume } from "../app/api/queues/incidents/route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("takes an auth503 through deferred queue publication and the real consumer to a local HTTP Slack fixture", async () => {
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "true"); vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", "synthetic-signing-key-not-real-12345");
  vi.stubEnv("VERCEL_ENV", "preview");
  const slack = ["https:", "", "hooks.slack.com", "services", "T0AMXNWGK4L", "BTEST", "SYNTHETICTESTONLY"].join("/");
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK_URL", slack);
  const received: string[] = [];
  const server = createServer(async (request, response) => {
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    received.push(Buffer.concat(parts).toString("utf8")); response.end("ok");
  });
  const originalFetch = globalThis.fetch;
  runtime.jobs.length = 0; runtime.after.mockImplementation(job => runtime.jobs.push(job));
  runtime.send.mockReset().mockResolvedValue({ messageId: "synthetic" });
  runtime.backend.mockRejectedValue(Object.assign(new Error("private password and balance=12345"), { code: "42703" }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture port");
    vi.stubGlobal("fetch", vi.fn((input, init) => {
      expect(String(input)).toBe(slack);
      return originalFetch(`http://127.0.0.1:${address.port}/slack-fixture`, init);
    }));
    const response = await auth(new Request("https://drip.example/api/auth/get-session?password=private"));
    expect(response.status).toBe(503); const result = await response.json();
    expect(runtime.send).not.toHaveBeenCalled(); expect(received).toHaveLength(0);
    expect(runtime.jobs).toHaveLength(1); await runtime.jobs[0]();
    const envelope = runtime.send.mock.calls[0][1];
    expect(envelope.incident.requestId).toBe(result.requestId);
    expect(envelope.incident.kind).toBe("schema_mismatch");
    const delivery = await consume(new Request("https://drip.example/api/queues/incidents", { method: "POST", body: JSON.stringify(envelope) }));
    expect(delivery.status).toBe(200); expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0]); expect(payload.text).toContain(result.requestId);
    expect(payload.text).toContain("GET /api/auth/get-session");
    expect(received[0]).not.toMatch(/private|12345|signature|SYNTHETICTESTONLY/);
    // Public callback input cannot forge an alert by changing signed fields.
    const forged = { ...envelope, incident: { ...envelope.incident, status: 500 } };
    expect((await consume(new Request("https://drip.example/api/queues/incidents", { method: "POST", body: JSON.stringify(forged) }))).status).toBe(500);
    expect(received).toHaveLength(1);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
