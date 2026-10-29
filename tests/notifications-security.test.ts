import { expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { allowedPushEndpoint, registrationSchema, scheduleSchema, subscriptionSchema } from "../server/notifications/model";
import { pushConfig } from "../server/notifications/config";
import { openSubscription, sealSubscription } from "../server/notifications/crypto";
import { reminderApi } from "../server/notifications/api";
import { dispatchReminders, providerStatus } from "../server/notifications/dispatch";
import type { ReminderStore } from "../server/notifications/store";
import { pushFixture } from "./notification-fixtures";

it.each(["https://fcm.googleapis.com/fcm/send/x", "https://web.push.apple.com/q", "https://push.apple.com/x", "https://updates.push.services.mozilla.com/wpush/x", "https://wns.notify.windows.com/x"])("accepts supported browser push host %s", value => expect(allowedPushEndpoint(value)).toBe(true));
it.each(["bad", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.test/x", "https://127.0.0.1/x", "https://169.254.169.254/x", "https://evil.test/x", "https://fcm.googleapis.com:444/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com/x#fragment"])("blocks arbitrary endpoint/SSRF %s", value => expect(allowedPushEndpoint(value)).toBe(false));
it("strictly bounds subscription crypto and schedules, rejecting extra financial data", () => {
  const { subscription, schedule } = pushFixture();
  expect(registrationSchema.safeParse({ subscription, schedule }).success).toBe(true);
  for (const keys of [{ ...subscription.keys, auth: "bad" }, { ...subscription.keys, p256dh: Buffer.alloc(65).toString("base64url") }, { ...subscription.keys, auth: "!".repeat(22) }]) expect(subscriptionSchema.safeParse({ ...subscription, keys }).success).toBe(false);
  expect(subscriptionSchema.safeParse({ ...subscription, keys: { ...subscription.keys, auth: `${subscription.keys.auth}==` } }).success).toBe(true);
  for (const value of [{ ...schedule, balance: 123 }, { ...schedule, plans: [{ ...schedule.plans[0], provider: "Private" }] }, { ...schedule, timeZone: "MadeUp/Zone" }, { ...schedule, plans: [{ anchor: "2026-02-30", frequency: "daily" }] }, { ...schedule, plans: [{ anchor: "0099-01-01", frequency: "monthly" }] }, { ...schedule, plans: Array(501).fill(schedule.plans[0]) }]) expect(scheduleSchema.safeParse(value).success).toBe(false);
  expect(scheduleSchema.parse({ ...schedule, plans: [{ ...schedule.plans[0], skipDate: "2026-10-29" }] }).plans).toHaveLength(1);
});
it("requires a complete dedicated key configuration and verifies the VAPID pair", () => {
  const { config, env } = pushFixture();
  expect(pushConfig({})).toBeNull(); expect(pushConfig({ CRON_SECRET: "unrelated-scheduler-secret" })).toBeNull();
  expect(pushConfig(env)).toEqual(config);
  expect(pushConfig({ ...env, BETTER_AUTH_URL: undefined })?.subject).toBe("https://drip-one-xi.vercel.app");
  for (const change of [{ DRIP_PUSH_PRIVATE_KEY: "" }, { DRIP_PUSH_STORAGE_KEY: "bad" }, { CRON_SECRET: "short" }, { DRIP_PUSH_PRIVATE_KEY: pushFixture().env.DRIP_PUSH_PRIVATE_KEY }, { BETTER_AUTH_URL: "http://drip.example" }, { BETTER_AUTH_URL: "bad-url" }]) expect(() => pushConfig({ ...env, ...change })).toThrow();
});
it("encrypts endpoints and transport keys with per-owner/device authenticated binding", () => {
  const { config, subscription, device } = pushFixture();
  const envelope = sealSubscription(subscription, config.storageKey, "owner", device);
  expect(openSubscription(envelope, config.storageKey, "owner", device)).toEqual(subscription);
  expect(JSON.stringify(envelope)).not.toContain(subscription.endpoint); expect(JSON.stringify(envelope)).not.toContain(subscription.keys.auth);
  expect(sealSubscription(subscription, config.storageKey, "owner", device).iv).not.toBe(envelope.iv);
  for (const open of [() => openSubscription(envelope, randomBytes(32), "owner", device), () => openSubscription(envelope, config.storageKey, "other", device), () => openSubscription(envelope, config.storageKey, "owner", "other"), () => openSubscription({ ...envelope, tag: randomBytes(16).toString("base64url") }, config.storageKey, "owner", device), () => openSubscription({ ...envelope, v: 2 as 1 }, config.storageKey, "owner", device)]) expect(open).toThrow();
});
function apiFixture() {
  const fixture = pushFixture(), now = new Date("2026-10-29T09:00:00Z");
  const row = { id: fixture.device, user_id: "owner", device_id: fixture.device, schedule: fixture.schedule, revision: 0, envelope: sealSubscription(fixture.subscription, fixture.config.storageKey, "owner", fixture.device) };
  const store = { current: vi.fn().mockResolvedValue(row), save: vi.fn(), remove: vi.fn(), expired: vi.fn(), allowTest: vi.fn().mockResolvedValue(true), subscription: vi.fn().mockReturnValue(fixture.subscription), candidates: vi.fn().mockResolvedValue([]), claim: vi.fn(), advance: vi.fn(), failed: vi.fn() };
  const sender = vi.fn().mockResolvedValue(undefined), session = vi.fn().mockResolvedValue({ user: { id: "owner" } });
  const deps = { config: () => fixture.config, origin: () => "https://drip.example", session, store: () => store as unknown as ReminderStore, sender: () => sender, now: () => now };
  const request = (method = "GET", extra: Record<string, string> = {}, body?: string) => new Request("https://drip.example/api/notifications/subscription", { method, headers: { origin: "https://drip.example", "x-drip-owner": "owner", "x-drip-device": fixture.device, "content-type": "application/json", ...extra }, body });
  return { ...fixture, row, store, sender, session, deps, api: reminderApi(deps), request };
}
it("returns only public configuration and own-device enrollment, with no-store on every response", async () => {
  const f = apiFixture(); const response = await f.api.config(), text = await response.text();
  expect(text).toContain(f.config.publicKey); expect(text).not.toContain(f.config.privateKey); expect(text).not.toContain(f.config.cronSecret);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await (await f.api.GET(f.request())).json()).toEqual({ enabled: true });
  f.store.current.mockResolvedValueOnce(undefined);
  expect(await (await f.api.GET(f.request())).json()).toEqual({ enabled: false });
  expect(f.store.current).toHaveBeenCalledWith("owner", f.device);
  expect(await (await reminderApi({ ...f.deps, config: () => null }).config()).json()).toEqual({ available: false });
});
it("rejects cross-origin writes, unauthenticated/other-owner requests and malformed device IDs before mutations", async () => {
  const f = apiFixture();
  expect((await f.api.PUT(f.request("PUT", { origin: "https://evil.test" }, "{}"))).status).toBe(403);
  expect(f.session).not.toHaveBeenCalled();
  expect((await f.api.GET(f.request("GET", { "x-drip-owner": "other" }))).status).toBe(401);
  expect((await f.api.DELETE(f.request("DELETE", { "x-drip-device": "invalid" }))).status).toBe(400);
  f.session.mockResolvedValueOnce(null);
  expect((await f.api.GET(f.request())).status).toBe(401);
  expect((await reminderApi({ ...f.deps, config: () => null }).GET(f.request())).status).toBe(503);
  expect(f.store.save).not.toHaveBeenCalled(); expect(f.store.remove).not.toHaveBeenCalled();
});
it("validates JSON/body size and persists only a strict schedule with its transport address", async () => {
  const f = apiFixture(), body = JSON.stringify({ subscription: f.subscription, schedule: f.schedule });
  expect((await f.api.PUT(f.request("PUT", {}, body))).status).toBe(200);
  expect(f.store.save).toHaveBeenCalledWith("owner", f.device, f.subscription, f.schedule, expect.any(Date));
  for (const [headers, content, code] of [[{ "content-type": "text/plain" }, body, 415], [{}, "{", 400], [{}, "{}", 400], [{ "content-length": "64001" }, body, 413], [{}, " ".repeat(64001), 413]] as const) expect((await f.api.PUT(f.request("PUT", headers, content))).status).toBe(code);
  expect((await f.api.PUT(f.request("PUT"))).status).toBe(400);
  expect((await f.api.DELETE(f.request("DELETE"))).status).toBe(200); expect(f.store.remove).toHaveBeenCalledWith("owner", f.device);
});
it("rate limits test notifications and handles expired enrollment without logging transport details", async () => {
  const f = apiFixture();
  expect(await (await f.api.test(f.request("POST"))).json()).toEqual({ accepted: true });
  expect(f.sender).toHaveBeenCalledWith(f.subscription, { type: "notification-test", date: "2026-10-29" });
  f.store.allowTest.mockResolvedValueOnce(false);
  const rate = await f.api.test(f.request("POST")); expect(rate.status).toBe(429); expect(rate.headers.get("retry-after")).toBe("60");
  f.sender.mockRejectedValueOnce({ statusCode: 410, message: f.subscription.endpoint });
  expect(await (await f.api.test(f.request("POST"))).json()).toMatchObject({ code: "PUSH_SUBSCRIPTION_EXPIRED" }); expect(f.store.expired).toHaveBeenCalledWith(f.row);
  f.store.current.mockResolvedValueOnce(undefined); expect((await f.api.test(f.request("POST"))).status).toBe(409);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  f.sender.mockRejectedValueOnce(new Error(`private ${f.subscription.endpoint} ${f.config.privateKey}`));
  const response = await f.api.test(f.request("POST")), text = await response.text();
  expect(response.status).toBe(503); expect(text).toContain("reference");
  expect(JSON.stringify(log.mock.calls) + text).not.toContain(f.subscription.endpoint); expect(JSON.stringify(log.mock.calls) + text).not.toContain(f.config.privateKey);
});
it("authorizes cron separately from user sessions and never reveals configuration errors", async () => {
  const f = apiFixture(); vi.spyOn(console, "info").mockImplementation(() => {});
  for (const auth of ["", "Bearer wrong", `Bearer ${f.config.cronSecret}extra`]) expect((await f.api.cron(f.request("GET", { authorization: auth }))).status).toBe(401);
  const response = await f.api.cron(f.request("GET", { authorization: `Bearer ${f.config.cronSecret}` }));
  expect(response.status).toBe(200); expect(f.session).not.toHaveBeenCalled();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = reminderApi({ ...f.deps, config: () => { throw new Error(f.config.privateKey); } });
  expect((await broken.config()).status).toBe(503);
});
it("dispatches only due local-day schedules, drains pages and classifies provider failures", async () => {
  const f = apiFixture(); const rows = [f.row, { ...f.row, id: "not-due", schedule: { ...f.schedule, plans: [{ anchor: "2026-10-30", frequency: "monthly" as const }] } }, { ...f.row, id: "leased" }, { ...f.row, id: "gone" }, { ...f.row, id: "retry" }];
  f.store.candidates.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  f.store.claim.mockImplementation(async row => row.id !== "leased");
  f.store.subscription.mockImplementation(row => ({ ...f.subscription, endpoint: row.id }));
  f.sender.mockImplementation(async subscription => { if (subscription.endpoint === "gone") throw { statusCode: 410 }; if (subscription.endpoint === "retry") throw { statusCode: 503 }; });
  const result = await dispatchReminders(f.store as unknown as ReminderStore, f.sender, f.deps.now());
  expect(result).toEqual({ inspected: 5, sent: 1, skipped: 2, expired: 1, failed: 1, deferred: false });
  expect(f.store.candidates.mock.calls[1][0]).toBe("retry");
  expect(f.store.failed).toHaveBeenCalledWith(expect.objectContaining({ id: "gone" }), expect.any(String), true);
  expect(providerStatus(null)).toBeUndefined(); expect(providerStatus({ statusCode: "410" })).toBeUndefined();
  f.store.candidates.mockResolvedValueOnce([f.row]);
  expect((await dispatchReminders(f.store as unknown as ReminderStore, f.sender, f.deps.now(), 0)).deferred).toBe(true);
});
it("waits for other in-flight deliveries when a database operation fails", async () => {
  const f = apiFixture(); f.store.candidates.mockResolvedValueOnce([f.row, { ...f.row, id: "db-broken" }]);
  f.store.claim.mockImplementation(async row => { if (row.id === "db-broken") throw new Error("db unavailable"); return true; });
  let finish!: () => void; f.sender.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let done = false; const pending = dispatchReminders(f.store as unknown as ReminderStore, f.sender, f.deps.now()).catch(error => { done = true; return error; });
  await vi.waitFor(() => expect(finish).toBeDefined()); expect(done).toBe(false); finish();
  expect(await pending).toBeInstanceOf(Error); expect(f.store.advance).toHaveBeenCalledOnce();
});

it("rejects invalid external registrations at the API boundary before any database write", async () => {
  const f = apiFixture();
  const valid = { subscription: f.subscription, schedule: f.schedule };
  const invalid = [
    { ...valid, balance: 123 },
    { ...valid, subscription: { ...f.subscription, endpoint: "https://127.0.0.1/internal" } },
    { ...valid, subscription: { ...f.subscription, keys: { ...f.subscription.keys, auth: "bad" } } },
    { ...valid, schedule: { ...f.schedule, timeZone: "Unknown/Zone" } },
    { ...valid, schedule: { ...f.schedule, plans: [{ anchor: "2026-02-30", frequency: "monthly" }] } },
    { ...valid, schedule: { ...f.schedule, plans: [{ ...f.schedule.plans[0], privateAccount: "not allowed" }] } },
  ];
  for (const body of invalid) {
    expect((await f.api.PUT(f.request("PUT", {}, JSON.stringify(body)))).status).toBe(400);
  }
  expect(f.store.save).not.toHaveBeenCalled();
});
