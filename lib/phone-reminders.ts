import { getItem, loadData, setItem } from "./db";
import { readCloudState } from "./cloud";
import { safeFetch } from "./worker-safety";
import { dateInZone, reminderSchedule } from "./payment-reminders";

const CONSENT = "phoneReminderConsent";
type Consent = { identityId: string; enabled: boolean };
export class PhoneReminderError extends Error { constructor(message: string, public code?: string) { super(message); } }
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request("drip-phone-settings", work);
  const next = queue.then(work, work); queue = next.catch(() => {}); return next;
}
export function phoneCapability(): "supported" | "install" | "unsupported" {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !installed) return "install";
  return typeof Notification !== "undefined" && "serviceWorker" in navigator && typeof PushManager !== "undefined" && window.isSecureContext ? "supported" : "unsupported";
}
export async function phoneConsent(identityId: string) { const value = await getItem<Consent>(CONSENT); return value?.identityId === identityId && value.enabled === true; }
export async function phoneConfiguration() {
  const response = await safeFetch("/api/notifications/config", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Phone reminders are unavailable. Try again later.");
  return response.json() as Promise<{ available: boolean; publicKey?: string; workerVersion?: number }>;
}
export async function reminderWorker(): Promise<ServiceWorkerRegistration> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Finish installing the app update, then try again.")), 5000); })]).finally(() => clearTimeout(deadline));
  const active = registration.active;
  if (!active) throw new Error("Finish installing the app update, then try again.");
  const version = await new Promise<number>(resolve => {
    const channel = new MessageChannel();
    const finish = (value: number) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value); };
    const timer = setTimeout(() => finish(0), 1500);
    channel.port1.onmessage = event => finish(Number(event.data?.version) || 0);
    active.postMessage({ type: "DRIP_WORKER_VERSION" }, [channel.port2]);
  });
  if (version < 4) throw new Error("Reload the available app update before turning on phone reminders.");
  return registration;
}
async function request(identityId: string, method: "GET" | "PUT" | "DELETE" | "POST", body?: unknown, endpoint = "subscription") {
  const state = await readCloudState();
  const gate = await getItem<{ generation: string; signedOut: boolean }>("deviceSession");
  if (state?.identityId !== identityId || gate?.signedOut) throw new Error("Sign in and connect cloud recovery to manage phone reminders.");
  const generation = gate?.generation ?? "initial";
  const response = await safeFetch(`/api/notifications/${endpoint}`, {
    method, cache: "no-store", credentials: "same-origin",
    headers: { "X-Drip-Owner": state.userId, "X-Drip-Reconnect": generation, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    const reference = result.reference ? " Reference: " + result.reference : "";
    throw new PhoneReminderError((result.error ?? "Could not update phone reminders.") + reference, result.code);
  }
  return result;
}
async function currentData(identityId: string) {
  const data = await loadData();
  if (data.identity?.id !== identityId) throw new Error("Account changed. Open reminders again for your current account.");
  return data;
}
function encode(bytes: ArrayBuffer | null) {
  if (!bytes) throw new Error("Could not read this device's notification address.");
  return btoa(String.fromCodePoint(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").split("=")[0];
}
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), char => char.codePointAt(0)!); }
async function saveSchedule(identityId: string, subscription: PushSubscription) {
  const data = await currentData(identityId);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const schedule = reminderSchedule(data.accounts, dateInZone(new Date(), timeZone), timeZone);
  await request(identityId, "PUT", { subscription: { endpoint: subscription.endpoint, keys: { p256dh: encode(subscription.getKey("p256dh")), auth: encode(subscription.getKey("auth")) } }, schedule });
}
function changed() { window.dispatchEvent(new Event("drip-phone-reminders-changed")); }

/** Permission request must be called directly from a user gesture by the caller. */
export async function enablePhoneReminders(identityId: string, publicKey: string, permission: Promise<NotificationPermission>) {
  if (await permission !== "granted") throw new Error("Notifications were not allowed. You can still use in-app reminders.");
  return serial(async () => {
    await currentData(identityId);
    const registration = await reminderWorker();
    const existing = await registration.pushManager.getSubscription();
    // Explicit opt-in creates a fresh address, including after provider expiry or
    // account switching. Background refresh never changes this browser permission.
    if (existing) await existing.unsubscribe();
    await currentData(identityId);
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decode(publicKey) });
    try {
      await saveSchedule(identityId, subscription);
      await currentData(identityId);
      await setItem(CONSENT, { identityId, enabled: true } satisfies Consent);
      changed();
    } catch (error) { await subscription.unsubscribe().catch(() => {}); throw error; }
  });
}
export async function disablePhoneReminders(identityId: string) {
  return serial(async () => {
    await currentData(identityId);
    await request(identityId, "DELETE");
    await currentData(identityId);
    await setItem(CONSENT, { identityId, enabled: false } satisfies Consent);
    changed();
  });
}
export async function phoneReminderStatus(identityId: string) {
  if (!await phoneConsent(identityId) || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!await registration?.pushManager.getSubscription()) return false;
  return (await request(identityId, "GET")).enabled === true;
}
export async function testPhoneReminder(identityId: string) { await currentData(identityId); await request(identityId, "POST", undefined, "test"); }
export async function syncPhoneReminders(identityId: string) {
  if (phoneCapability() !== "supported") return;
  return serial(async () => {
    const consent = await getItem<Consent>(CONSENT);
    if (!consent?.enabled) return;
    await currentData(identityId);
    // A shared browser must not continue the previous account's enrollment.
    if (consent?.enabled && consent.identityId !== identityId) {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const old = await registration?.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      if ((await getItem<Consent>(CONSENT))?.identityId === consent.identityId) await setItem(CONSENT, { identityId, enabled: false } satisfies Consent);
      return;
    }
    if (!consent?.enabled || Notification.permission !== "granted") return;
    if (!(await request(identityId, "GET")).enabled) throw new Error("Phone reminders need to be turned on again for this device.");
    const registration = await reminderWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw new Error("Phone reminders need to be turned on again for this device.");
    await saveSchedule(identityId, subscription);
  });
}
