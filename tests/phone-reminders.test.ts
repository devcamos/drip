// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import * as cloud from "../lib/cloud";
import { safeFetch } from "../lib/worker-safety";
import * as Phone from "../lib/phone-reminders";
import { holding } from "./notification-fixtures";
vi.mock("../lib/db", () => ({ getItem: vi.fn(), setItem: vi.fn(), loadData: vi.fn(), lockLocalVault: vi.fn() }));
vi.mock("../lib/cloud", () => ({ readCloudState: vi.fn() }));
vi.mock("../lib/worker-safety", () => ({ safeFetch: vi.fn() }));
let values: Map<string, unknown>, subscription: { endpoint: string; getKey: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> }, registration: any;
beforeEach(() => {
  vi.resetAllMocks(); values = new Map([["phoneReminderConsent", { identityId: "local-owner", enabled: true }]]);
  vi.mocked(db.getItem).mockImplementation(async key => values.get(key) as any);
  vi.mocked(db.setItem).mockImplementation(async (key, value) => { values.set(key, value); });
  vi.mocked(db.loadData).mockResolvedValue({ version: 1, accounts: [holding()], snapshots: [], lastBackupAt: null, identity: { id: "local-owner", handle: "test", createdAt: "2026-01-01" } });
  vi.mocked(cloud.readCloudState).mockResolvedValue({ userId: "server-owner", identityId: "local-owner" } as any);
  vi.mocked(safeFetch).mockImplementation(async () => Response.json({ enabled: true, available: true, publicKey: "AQID" }));
  subscription = { endpoint: "https://fcm.googleapis.com/synthetic", getKey: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]).buffer), unsubscribe: vi.fn().mockResolvedValue(true) };
  registration = { active: { postMessage: (_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ version: 4 }) }, pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription), subscribe: vi.fn().mockResolvedValue(subscription) } };
  vi.stubGlobal("navigator", { userAgent: "Chrome", maxTouchPoints: 0, serviceWorker: { ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration) } });
  vi.stubGlobal("Notification", { permission: "granted" }); vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
});
it("detects iPhone installation and unsupported contexts without triggering permission", () => {
  expect(Phone.phoneCapability()).toBe("supported");
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: false }); expect(Phone.phoneCapability()).toBe("install");
  vi.stubGlobal("navigator", { userAgent: "Mac", maxTouchPoints: 5, standalone: true }); expect(Phone.phoneCapability()).toBe("unsupported");
  vi.stubGlobal("Notification", undefined); expect(Phone.phoneCapability()).toBe("unsupported");
});
it("exposes only own-device consent and loads public deployment status", async () => {
  expect(await Phone.phoneConsent("other")).toBe(false); expect(await Phone.phoneConsent("local-owner")).toBe(true);
  expect(await Phone.phoneConfiguration()).toMatchObject({ available: true });
  vi.mocked(safeFetch).mockResolvedValueOnce(new Response("no", { status: 503 })); await expect(Phone.phoneConfiguration()).rejects.toThrow(/unavailable/);
});
it("gates opt-in on permission and worker v4, with bounded worker timeouts", async () => {
  await expect(Phone.enablePhoneReminders("local-owner", "AQID", Promise.resolve("denied"))).rejects.toThrow(/not allowed/);
  registration.active = null; await expect(Phone.reminderWorker()).rejects.toThrow(/Finish installing/);
  registration.active = { postMessage: (_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ version: 3 }) };
  await expect(Phone.reminderWorker()).rejects.toThrow(/Reload/);
  vi.useFakeTimers();
  (navigator.serviceWorker as any).ready = new Promise(() => {}) as any;
  const waiting = Phone.reminderWorker().catch(error => error); await vi.advanceTimersByTimeAsync(5000); expect((await waiting).message).toMatch(/Finish installing/);
  (navigator.serviceWorker as any).ready = Promise.resolve({ ...registration, active: { postMessage() {} } }) as any;
  const silent = Phone.reminderWorker().catch(error => error); await vi.advanceTimersByTimeAsync(1500); expect((await silent).message).toMatch(/Reload/); vi.useRealTimers();
});
it("opts in explicitly with a fresh address and sends only whitelisted saved schedules", async () => {
  await Phone.enablePhoneReminders("local-owner", "AQID", Promise.resolve("granted"));
  expect(subscription.unsubscribe).toHaveBeenCalledOnce(); expect(registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
  const [url, init] = vi.mocked(safeFetch).mock.calls[0]; expect(url).toBe("/api/notifications/subscription");
  expect(new Headers(init?.headers).get("x-drip-owner")).toBe("server-owner"); expect(new Headers(init?.headers).get("x-drip-reconnect")).toBe("initial");
  const body = JSON.parse(init?.body as string); expect(body.subscription.keys).toEqual({ p256dh: "AQID", auth: "AQID" });
  expect(body.schedule.plans).toEqual([{ anchor: "2026-01-31", frequency: "monthly" }]); expect(init?.body).not.toMatch(/Realty|1200|Private|Trading/);
  expect(values.get("phoneReminderConsent")).toEqual({ identityId: "local-owner", enabled: true });
});
it("cleans up a newly created address when enrollment fails and exposes a safe error reference", async () => {
  registration.pushManager.getSubscription.mockResolvedValue(null);
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ error: "Try later.", reference: "safe-reference" }, { status: 503 }));
  await expect(Phone.enablePhoneReminders("local-owner", "AQID", Promise.resolve("granted"))).rejects.toThrow(/safe-reference/);
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  subscription.getKey.mockReturnValue(null);
  await expect(Phone.enablePhoneReminders("local-owner", "AQID", Promise.resolve("granted"))).rejects.toThrow(/read this device/);
});
it("does not update a different identity or signed-out session", async () => {
  await expect(Phone.enablePhoneReminders("other", "AQID", Promise.resolve("granted"))).rejects.toThrow(/Account changed/);
  values.set("deviceSession", { generation: "out", signedOut: true });
  await expect(Phone.testPhoneReminder("local-owner")).rejects.toThrow(/Sign in/);
  values.delete("deviceSession"); vi.mocked(cloud.readCloudState).mockResolvedValueOnce(undefined);
  await expect(Phone.testPhoneReminder("local-owner")).rejects.toThrow(/Sign in/);
  vi.mocked(cloud.readCloudState).mockResolvedValueOnce({ identityId: "other" } as any);
  await expect(Phone.testPhoneReminder("local-owner")).rejects.toThrow(/Sign in/);
  expect(safeFetch).not.toHaveBeenCalled();
});
it("turns off only the authenticated enrollment and tests without sending an account payload", async () => {
  values.set("deviceSession", { generation: "current", signedOut: false });
  await Phone.disablePhoneReminders("local-owner"); expect(values.get("phoneReminderConsent")).toEqual({ identityId: "local-owner", enabled: false });
  expect(vi.mocked(safeFetch).mock.calls[0][1]?.method).toBe("DELETE"); expect(subscription.unsubscribe).not.toHaveBeenCalled();
  await Phone.testPhoneReminder("local-owner"); expect(vi.mocked(safeFetch).mock.calls[1]).toEqual(["/api/notifications/test", expect.objectContaining({ method: "POST", body: undefined })]);
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ code: "PUSH_SUBSCRIPTION_EXPIRED" }, { status: 410 }));
  await expect(Phone.testPhoneReminder("local-owner")).rejects.toMatchObject({ code: "PUSH_SUBSCRIPTION_EXPIRED", message: "Could not update phone reminders." });
});
it("reports enabled only with consent, native permission, a browser transport and server enrollment", async () => {
  expect(await Phone.phoneReminderStatus("other")).toBe(false);
  (Notification as any).permission = "denied" as any; expect(await Phone.phoneReminderStatus("local-owner")).toBe(false); (Notification as any).permission = "granted" as any;
  registration.pushManager.getSubscription.mockResolvedValueOnce(null); expect(await Phone.phoneReminderStatus("local-owner")).toBe(false);
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ enabled: false })); expect(await Phone.phoneReminderStatus("local-owner")).toBe(false);
  expect(await Phone.phoneReminderStatus("local-owner")).toBe(true);
});
it("refreshes from saved data, never silently re-enrolls expired addresses and respects opt-out", async () => {
  await Phone.syncPhoneReminders("local-owner"); expect(vi.mocked(safeFetch).mock.calls.map(call => call[1]?.method)).toEqual(["GET", "PUT"]);
  vi.mocked(safeFetch).mockClear(); values.set("phoneReminderConsent", { identityId: "local-owner", enabled: false });
  await Phone.syncPhoneReminders("local-owner"); expect(safeFetch).not.toHaveBeenCalled();
  values.set("phoneReminderConsent", { identityId: "local-owner", enabled: true });
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ enabled: false })); await expect(Phone.syncPhoneReminders("local-owner")).rejects.toThrow(/turned on again/);
  registration.pushManager.getSubscription.mockResolvedValueOnce(null); await expect(Phone.syncPhoneReminders("local-owner")).rejects.toThrow(/turned on again/);
  expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  (Notification as any).permission = "denied" as any; await Phone.syncPhoneReminders("local-owner");
});
it("retires the previous browser owner's transport but requires explicit opt-in by its new owner", async () => {
  values.set("phoneReminderConsent", { identityId: "previous-owner", enabled: true });
  await Phone.syncPhoneReminders("local-owner"); expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  expect(values.get("phoneReminderConsent")).toEqual({ identityId: "local-owner", enabled: false }); expect(safeFetch).not.toHaveBeenCalled();
  vi.stubGlobal("PushManager", undefined); await Phone.syncPhoneReminders("local-owner");
});
it("serializes settings with a distinct lock and rechecks identity after delayed enrollment", async () => {
  const request = vi.fn(async (_name: string, run: () => Promise<void>) => run()); Object.assign(navigator, { locks: { request } });
  const saved = await db.loadData();
  vi.mocked(db.loadData).mockResolvedValueOnce(saved).mockResolvedValueOnce(saved).mockResolvedValueOnce(saved).mockResolvedValueOnce({ version: 1, accounts: [], snapshots: [], lastBackupAt: null, identity: { id: "new", handle: "new", createdAt: "2026-01-01" } });
  await expect(Phone.enablePhoneReminders("local-owner", "AQID", Promise.resolve("granted"))).rejects.toThrow(/Account changed/);
  expect(request).toHaveBeenCalledWith("drip-phone-settings", expect.any(Function)); expect(subscription.unsubscribe).toHaveBeenCalledTimes(2);
});
