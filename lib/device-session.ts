import { getItem, setItem, completeDeviceSession } from "./db";
import { authClient, connect, readCloudState, restoreCloud } from "./cloud";
import { checkCode } from "./crypto";
import { resolveRecoveryCode } from "./recovery-codes";
import type { AppData } from "./types";

export interface DeviceSession { signedOut: boolean; remotePending: boolean; generation: string }
export const readDeviceSession = () => getItem<DeviceSession>("deviceSession");
export function notifyDeviceSession() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("drip-session-changed"));
  // No account information or secrets: notify other tabs to re-read IndexedDB.
  try { localStorage.setItem("drip-session-notify", crypto.randomUUID()); } catch { /* Storage events are optional; foreground refresh also checks. */ }
}
let ending: { generation: string; promise: Promise<void> } | undefined;
export async function finishDeviceSignOut(): Promise<void> {
  const current = await readDeviceSession();
  if (!current?.signedOut || !current.remotePending) return;
  if (ending?.generation === current.generation) return ending.promise;
  const promise = (async () => {
    if (!navigator.onLine) throw new Error("Cloud sign-out is waiting for a connection. Drip is locked on this device.");
    // A local-only build has no authentication backend or server session to revoke.
    const status = await fetch("/api/cloud/status", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!status.ok) throw new Error("Could not confirm cloud sign-out. Drip is locked on this device; try again online.");
    const available = (await status.json()).available === true;
    if (available || await readCloudState()) {
      const result = await authClient.signOut({ fetchOptions: { timeout: 8000, retry: 0, headers: { "X-Drip-Signout": current.generation } } });
      if (result.error) throw new Error("Could not confirm cloud sign-out. Drip is locked on this device; try again online.");
    }
    await completeDeviceSession(current.generation, { ...current, remotePending: false });
    notifyDeviceSession();
  })();
  ending = { generation: current.generation, promise };
  try { await promise; } finally { if (ending?.promise === promise) ending = undefined; }
}
export async function signOutDevice() {
  // Lock first, including offline. Keep accounts, recovery verifier and queued revisions.
  await setItem("deviceSession", { signedOut: true, remotePending: true, generation: crypto.randomUUID() } satisfies DeviceSession);
  notifyDeviceSession();
  await finishDeviceSignOut();
}
export async function resumeDevice(code: string, verifier: { salt: string; hash: string }, data: AppData) {
  const current = await readDeviceSession();
  if (!current?.signedOut) throw new Error("Device session changed. Try signing in again.");
  const root = await resolveRecoveryCode(code);
  if (!(await checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
  // Do not let an earlier sign-out response erase the session we are about to create.
  try { await ending?.promise; } catch { /* Offline resume still protects unsynced local data. */ }
  // Claim the new generation before authentication. Other tabs' old sign-out
  // requests must already be stale when the new cookie is issued.
  const claimed = { signedOut: true, remotePending: false, generation: crypto.randomUUID() };
  if (!(await completeDeviceSession(current.generation, claimed))) throw new Error("Sign-out changed in another tab. Try signing in again.");
  notifyDeviceSession();
  try {
    const cloud = await readCloudState();
    if (cloud && navigator.onLine) {
      const account = await connect(root, data, false, claimed.generation);
      if (account.user.id !== cloud.userId) throw new Error("That is not the connected cloud account.");
    }
    if (!(await completeDeviceSession(claimed.generation, { ...claimed, signedOut: false }))) throw new Error("Sign-out changed in another tab. Try signing in again.");
    notifyDeviceSession();
  } catch (error) {
    if (await completeDeviceSession(claimed.generation, { ...claimed, remotePending: true })) notifyDeviceSession();
    throw error;
  }
}

/** Explicitly replace this device from another cloud account, only after UI confirmation. */
export async function restoreOtherAccount(code: string) {
  const current = await readDeviceSession();
  if (!current?.signedOut) throw new Error("Sign out before switching accounts.");
  try { await ending?.promise; } catch { /* Explicit recovery claims a new generation below. */ }
  const claimed = { signedOut: true, remotePending: false, generation: crypto.randomUUID() };
  if (!(await completeDeviceSession(current.generation, claimed))) throw new Error("Device session changed. Try again.");
  notifyDeviceSession();
  try {
    const data = await restoreCloud(code, undefined, claimed.generation);
    notifyDeviceSession();
    return data;
  } catch (error) {
    if (await completeDeviceSession(claimed.generation, { ...claimed, remotePending: true })) notifyDeviceSession();
    throw error;
  }
}
