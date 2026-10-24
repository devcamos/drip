import { afterEach, beforeEach, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), handler: vi.fn() }));
vi.mock("../server/auth", () => ({ cloudConfigured: () => true, getAuth: () => ({ handler: backend.handler, api: { getSession: backend.session } }), database: () => ({ query: backend.query }) }));
import { GET as auth } from "../app/api/auth/[...all]/route";
import { GET as cloud, PUT as save } from "../app/api/cloud/route";
import { POST as recovery, PUT as rotate } from "../app/api/recovery-codes/route";
const origin = "https://drip.example";
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", origin); vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-only");
  backend.session.mockReset().mockResolvedValue({ user: { id: "synthetic" } });
  backend.query.mockReset().mockRejectedValue(Object.assign(new Error("private SQL and password"), { code: "42703" }));
  backend.handler.mockReset().mockRejectedValue(new Error("Database schema mismatch; session.dripDeviceId"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("returns a safe auth503 when the owner/session check fails before the auth handler", async () => {
  backend.session.mockRejectedValue(new Error("secret database connection"));
  const response = await auth(new Request(origin + "/api/auth/get-session", { headers: { "X-Drip-Owner": "synthetic", "x-drip-request-id": "attacker" } }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "AUTH_UNAVAILABLE", requestId: response.headers.get("x-drip-request-id") });
  expect(response.headers.get("x-drip-request-id")).not.toBe("attacker");
  expect(backend.handler).not.toHaveBeenCalled();
});

it("logs the missing-schema auth failure with the same reference as its safe response", async () => {
  const response = await auth(new Request(origin + "/api/auth/ok"));
  expect(response.status).toBe(503);
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject({ operation: "auth", kind: "schema_mismatch", requestId: response.headers.get("x-drip-request-id") });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/dripDeviceId|password|private|connection/);
});

it.each(["read", "save", "lookup", "rotate"])("normalizes a %s database outage into JSON503", async operation => {
  const headers = { origin, "X-Drip-Owner": "synthetic", "Content-Type": "application/json" };
  let response: Response;
  if (operation === "read") response = await cloud(new Request(origin + "/api/cloud", { headers }));
  else if (operation === "save") response = await save(new Request(origin + "/api/cloud", { method: "PUT", headers, body: "{}" }));
  else if (operation === "lookup") response = await recovery(new Request(origin + "/api/recovery-codes", { method: "POST", headers, body: "{}" }));
  else response = await rotate(new Request(origin + "/api/recovery-codes", { method: "PUT", headers, body: "{}" }));
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
  const value = await response.json();
  expect(value.requestId).toBe(response.headers.get("x-drip-request-id"));
  expect(JSON.stringify(value)).not.toMatch(/private|SQL|password|42703/);
});
