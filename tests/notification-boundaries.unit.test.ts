import { expect, it, vi } from "vitest";
import { reminderApi } from "../server/notifications/api";
import type { ReminderStore } from "../server/notifications/store";

const device = "cb21a04b-9763-4bc4-a044-4b512f37d75f";
function fixture() {
  const config = { publicKey: "public", privateKey: "private", storageKey: Buffer.alloc(32), cronSecret: "cron-secret", subject: "https://drip.example" };
  const session = vi.fn().mockResolvedValue({ user: { id: "owner" } });
  const store = { current: vi.fn().mockResolvedValue(undefined), save: vi.fn(), remove: vi.fn(), allowTest: vi.fn(), subscription: vi.fn(), expired: vi.fn() };
  const send = vi.fn().mockResolvedValue(undefined);
  const api = reminderApi({ config: () => config, origin: () => "https://drip.example", session, store: () => store as unknown as ReminderStore, sender: () => send, now: () => new Date("2026-10-29T09:00:00Z") });
  const req = (method: string, headers: Record<string, string> = {}, body?: string) => new Request("https://drip.example/api/notifications/subscription", { method, headers: { origin: "https://drip.example", "x-drip-owner": "owner", "x-drip-device": device, "content-type": "application/json", ...headers }, body });
  return { api, req, session, store, send };
}

it("exposes only the public configuration with no-store headers", async () => {
  const f = fixture(), response = await f.api.config(), body = await response.text();
  expect(body).toContain("public"); expect(body).not.toContain("private"); expect(body).not.toContain("cron-secret"); expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects cross-origin writes before looking up a session", async () => {
  const f = fixture(), response = await f.api.PUT(f.req("PUT", { origin: "https://evil.example" }, "{}"));
  expect(response.status).toBe(403); expect(f.session).not.toHaveBeenCalled(); expect(f.store.save).not.toHaveBeenCalled();
});
it("requires a matching authenticated owner and valid device before reading enrollment", async () => {
  const f = fixture(); f.session.mockResolvedValueOnce(null);
  expect((await f.api.GET(f.req("GET"))).status).toBe(401);
  expect((await f.api.GET(f.req("GET", { "x-drip-owner": "other" }))).status).toBe(401);
  expect((await f.api.GET(f.req("GET", { "x-drip-device": "not-a-device" }))).status).toBe(400);
  expect(f.store.current).not.toHaveBeenCalled();
});
it("returns enrollment state without exposing the subscription", async () => {
  const f = fixture(); f.store.current.mockResolvedValueOnce({ endpoint: "private-endpoint" });
  const response = await f.api.GET(f.req("GET")); expect(await response.json()).toEqual({ enabled: true });
  expect(f.store.current).toHaveBeenCalledWith("owner", device); expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects unsupported content types, excessive bodies and invalid payloads before storage", async () => {
  const f = fixture();
  expect((await f.api.PUT(f.req("PUT", { "content-type": "text/plain" }, "{}"))).status).toBe(415);
  expect((await f.api.PUT(f.req("PUT", { "content-length": "64001" }, "{}"))).status).toBe(413);
  expect((await f.api.PUT(f.req("PUT", {}, "{"))).status).toBe(400);
  expect((await f.api.PUT(f.req("PUT", {}, JSON.stringify({ balance: 100 })))).status).toBe(400);
  expect(f.store.save).not.toHaveBeenCalled();
});
it("requires an enrolled device and enforces the test-message budget", async () => {
  const f = fixture(); expect((await f.api.test(f.req("POST"))).status).toBe(409);
  f.store.current.mockResolvedValueOnce({ id: "row" }); f.store.allowTest.mockResolvedValueOnce(false);
  expect((await f.api.test(f.req("POST"))).status).toBe(429); expect(f.send).not.toHaveBeenCalled();
});
it("sends a generic test message and removes an expired subscription", async () => {
  const f = fixture(), row = { id: "row", schedule: { timeZone: "UTC" } }; f.store.current.mockResolvedValue(row); f.store.allowTest.mockResolvedValue(true); f.store.subscription.mockReturnValue({ endpoint: "private" });
  expect((await f.api.test(f.req("POST"))).status).toBe(200);
  expect(f.send).toHaveBeenCalledWith({ endpoint: "private" }, { type: "notification-test", date: "2026-10-29" });
  f.send.mockRejectedValueOnce({ statusCode: 410 }); const response = await f.api.test(f.req("POST"));
  expect(response.status).toBe(410); expect(f.store.expired).toHaveBeenCalledWith(row);
});
it("denies a dispatch without the configured bearer secret", async () => {
  const f = fixture(); expect((await f.api.cron(f.req("GET"))).status).toBe(401); expect((await f.api.cron(f.req("GET", { authorization: "Bearer wrong" }))).status).toBe(401);
});
it("reports server failures without logging raw subscription data", async () => {
  const f = fixture(); f.store.current.mockRejectedValueOnce(new Error("sensitive endpoint")); const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await f.api.GET(f.req("GET")); expect(response.status).toBe(503); expect(await response.text()).not.toContain("sensitive endpoint"); expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive endpoint");
});
