import { getItem, setItem, completeDeviceSession, hasCloudConnection, unlockLocalVault, lockLocalVault, prepareLocalSignOut, cancelLocalSignOut, type VaultBinding } from "./db";
import { authClient, connect, restoreCloud } from "./cloud";
import { checkCode } from "./crypto";
import { resolveRecoveryCode } from "./recovery-codes";
import type { AppData, CloudState } from "./types";

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
    if (available || await hasCloudConnection()) {
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
  // Finish edits already accepted by the UI before dropping their encryption key.
  await prepareLocalSignOut();
  try { await setItem("deviceSession", { signedOut: true, remotePending: true, generation: crypto.randomUUID() } satisfies DeviceSession); }
  catch (error) { cancelLocalSignOut(); throw error; }
  notifyDeviceSession();
  await finishDeviceSignOut();
}

/** Best-effort cloud renewal must never decide whether a verified local key works. */
async function renewCloudAfterUnlock(root: string, data: AppData, expected: CloudState, generation: string) {
  try {
    const device = await readDeviceSession();
    const cloud = await getItem<CloudState>("cloudState");
    if (device?.signedOut || device?.generation !== generation || cloud?.userId !== expected.userId || cloud?.generation !== expected.generation) return;
    // Password sign-in already issued the ordinary session. Do not spend an
    // additional recovery-auth attempt to renew an already matching session.
    try { if ((await authClient.getSession()).data?.user.id === expected.userId) return; } catch { /* Retry through the recovery credential below. */ }
    // safeFetch checks this generation again under the private-request lock,
    // so a delayed renewal cannot authenticate after a later sign-out.
    const account = await connect(root, data, false, undefined, generation);
    if (account.user.id !== expected.userId) return;
  } catch {
    // Keep the local vault and queued edits. Sync reports its own auth/network
    // status; Recovery can renew sign-in later without replacing local data.
  } finally {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-cloud-changed"));
  }
}

export async function resumeDevice(code: string, verifier: { salt: string; hash: string }, _data?: AppData, expected?: VaultBinding) {
  const current = await readDeviceSession();
  if (!current?.signedOut) throw new Error("Device session changed. Try signing in again.");
  if (expected && current.generation !== expected.generation) throw new Error("Device session changed. Try signing in again.");
  const root = await resolveRecoveryCode(code);
  if (!(await checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
  // Do not let an earlier sign-out response erase the session we are about to create.
  try { await ending?.promise; } catch { /* Offline resume still protects unsynced local data. */ }
  // Claim the new generation before unlocking. Other tabs' old sign-out
  // requests must already be stale when a new cookie can be issued.
  const claimed = { signedOut: true, remotePending: false, generation: crypto.randomUUID() };
  if (!(await completeDeviceSession(current.generation, claimed))) throw new Error("Sign-out changed in another tab. Try signing in again.");
  notifyDeviceSession();
  try {
    const { data, state: cloud } = await unlockLocalVault(root, expected ? { ...expected, generation: claimed.generation } : undefined);
    if (!(await completeDeviceSession(claimed.generation, { ...claimed, signedOut: false }))) throw new Error("Sign-out changed in another tab. Try signing in again.");
    notifyDeviceSession();
    if (cloud && navigator.onLine) void renewCloudAfterUnlock(root, data, cloud, claimed.generation);
  } catch (error) {
    lockLocalVault();
    if (await completeDeviceSession(claimed.generation, { ...claimed, remotePending: true })) notifyDeviceSession();
    throw error;
  }
}

/** Unlock a fresh page without restoring over unsynced local records. */
export async function unlockDevice(code: string, expected?: VaultBinding) {
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  const session = await readDeviceSession();
  if (session?.signedOut) {
    if (!verifier) throw new Error("Local recovery information is missing. Restore your cloud copy or encrypted backup.");
    await resumeDevice(code, verifier, undefined, expected); return;
  }
  const root = await resolveRecoveryCode(code);
  await unlockLocalVault(root, expected);
  notifyDeviceSession();
}

/** Explicitly replace this device from another cloud account, only after UI confirmation. */
export async function restoreOtherAccount(code: string, expected?: { generation?: string; userId?: string }, quiet = false) {
  const current = await readDeviceSession();
  if (!current?.signedOut) throw new Error("Sign out before switching accounts.");
  if (expected && current.generation !== expected.generation) throw new Error("Device session changed. Try again.");
  try { await ending?.promise; } catch { /* Explicit recovery claims a new generation below. */ }
  const claimed = { signedOut: true, remotePending: false, generation: crypto.randomUUID() };
  if (!(await completeDeviceSession(current.generation, claimed))) throw new Error("Device session changed. Try again.");
  if (!quiet) notifyDeviceSession();
  try {
    const data = await restoreCloud(code, expected?.userId, claimed.generation);
    if (!quiet) notifyDeviceSession();
    return data;
  } catch (error) {
    if (await completeDeviceSession(claimed.generation, { ...claimed, remotePending: true }) && !quiet) notifyDeviceSession();
    throw error;
  }
}
