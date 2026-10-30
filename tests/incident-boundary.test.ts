import { afterEach, beforeEach, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({ scheduleIncident: vi.fn() }));
vi.mock("../server/incident-queue", () => queue);
import { withApiErrors, reportException } from "../server/http-errors";

const fallback = { code: "AUTH_UNAVAILABLE", message: "Please try again shortly." };
beforeEach(() => { queue.scheduleIncident.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("captures an exception before auth with the response reference and sanitized details", async () => {
  const error = Object.assign(new Error("private password, query and balance=12345"), { code: "42703" });
  const request = new Request("https://drip.example/api/auth/get-session?token=private", { headers: { "x-drip-request-id": "forged", cookie: "private" } });
  const response = await withApiErrors("auth", async () => { throw error; }, fallback, request);
  expect(response.status).toBe(503);
  expect(queue.scheduleIncident).toHaveBeenCalledOnce();
  expect(queue.scheduleIncident.mock.calls[0][0]).toMatchObject({ route: "/api/auth/get-session", status: 503, kind: "schema_mismatch", requestId: response.headers.get("x-drip-request-id") });
  expect(JSON.stringify(queue.scheduleIncident.mock.calls)).not.toMatch(/private|12345|forged|token|cookie/);
});
it("captures returned 502 once, hides its raw body and removes partial auth cookies", async () => {
  const response = await withApiErrors("auth", async () => new Response("private database password", { status: 502, headers: { "Set-Cookie": "partial=private", "X-Drip-Safe-Error": "true" } }), fallback);
  expect(response.status).toBe(502); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.json()).toEqual({ ...fallback, requestId: response.headers.get("x-drip-request-id") });
  expect(queue.scheduleIncident).toHaveBeenCalledOnce();
});
it.each([200, 400, 401, 403, 409, 429])("does not page Slack for HTTP %s and preserves the response", async status => {
  const response = await withApiErrors("auth", async () => Response.json({ detail: "unchanged" }, { status }), fallback);
  expect(queue.scheduleIncident).not.toHaveBeenCalled();
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ detail: "unchanged" });
});
it("reports a caught-and-rethrown exception once without double paging", async () => {
  await withApiErrors("auth", async () => { const error = { code: "ECONNRESET" }; reportException(error); throw error; }, fallback);
  expect(console.error).toHaveBeenCalledOnce(); expect(queue.scheduleIncident).toHaveBeenCalledOnce();
});
it("keeps the original safe response when alert scheduling or error inspection throws", async () => {
  queue.scheduleIncident.mockImplementation(() => { throw new Error("private scheduler failure"); });
  const response = await withApiErrors("auth", async () => { throw { get code() { throw new Error("private error getter"); } }; }, fallback);
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject(fallback);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
});
