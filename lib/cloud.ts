import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { normaliseCode, isValidCode, codeVerifier, deriveCloudEncryptionKey, checkCode } from "./crypto";
import { getItem, isAppData, commitCloudRestore, cloudSnapshot, acknowledgeCloudUpload, storeCloudConnection, type RetainedAccount } from "./db";
import type { AppData, CloudState } from "./types";
export type { CloudState } from "./types";
import { migrateData } from "./maths";
import { safeFetch } from "./worker-safety";
import { cloudPayload, fromCloudPayload } from "./cloud-payload";

export const authClient = createAuthClient({ plugins: [passkeyClient()], fetchOptions: { customFetchImpl: safeFetch } });
export interface Envelope { app: "drip-cloud"; v: 1; iv: string; ct: string }
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => {
  let out = "";
  for (const b of bytes) { out += String.fromCodePoint(b); }
  return btoa(out);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.codePointAt(0)!);
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function recoveryCredentials(code: string) {
  if (!isValidCode(code)) throw new Error("Enter your complete recovery code.");
  const normal = normaliseCode(code);
  const locator = await hash(`drip-recovery-locator-v1:${normal}`);
  // Domain separation: the server never receives the encryption root code.
  return {
    email: `${locator}@recovery.drip.invalid`,
    password: await hash(`drip-recovery-auth-v1:${normal}`),
  };
}
export const cloudKey = deriveCloudEncryptionKey;
export async function seal(data: AppData, key: CryptoKey): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const safe = cloudPayload(data);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("drip-cloud-v1") }, key, enc.encode(JSON.stringify(safe)));
  return { app: "drip-cloud", v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
async function decode(envelope: Envelope, key: CryptoKey): Promise<AppData> {
  if (envelope.app !== "drip-cloud" || envelope.v !== 1) throw new Error("Unsupported cloud copy.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(envelope.iv), additionalData: enc.encode("drip-cloud-v1") }, key, unb64(envelope.ct));
  const data = JSON.parse(new TextDecoder().decode(plain));
  if (!isAppData(data) || !data.identity) throw new Error("Invalid cloud copy.");
  return data;
}
export async function unseal(envelope: Envelope, key: CryptoKey): Promise<AppData> {
  return migrateData(fromCloudPayload(await decode(envelope, key)), new Date().toISOString().slice(0, 10));
}
export const readCloudState = () => getItem<CloudState>("cloudState");
export async function writeCloudState(state: CloudState | undefined, expected?: { generation: string | undefined; connectionGeneration?: string }) {
  const session = await getItem<{ generation: string }>("deviceSession");
  await storeCloudConnection(state, expected ? expected.generation : session?.generation, expected?.connectionGeneration);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-cloud-changed"));
}

export async function vault(method = "GET", body?: unknown, ownerId?: string, resumeGeneration?: string, signupNonce?: string) {
  const response = await safeFetch("/api/cloud", { method, credentials: "same-origin", cache: "no-store", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(ownerId ? { "X-Drip-Owner": ownerId } : {}), ...(resumeGeneration ? { "X-Drip-Resume": resumeGeneration } : {}), ...(signupNonce ? { "X-Drip-Signup": signupNonce } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) {
    const messages: Record<number, string> = {
      409: "Cloud changed on another device. Export a local backup, then restore the cloud copy before saving again.",
      401: "Sign in again to sync. Your local data is safe.",
    };
    throw new Error(messages[response.status] ?? "Cloud is unavailable. Your local data is safe; try again online.");
  }
  return response.json() as Promise<{ version: number; envelope: Envelope | null; updated_at?: string }>;
}
function authFailure(error: unknown, create: boolean) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return new Error("Too many sign-in attempts. Wait a minute, then try again.");
  if (status && status >= 500) return new Error(create
    ? "Could not create your account because Drip's sign-in service is unavailable. Try again shortly."
    : "Drip's sign-in service is unavailable. Try again shortly.");
  return new Error(create
    ? "Could not create your account. Refresh the app and try again."
    : "Could not sign in. Check your recovery code and connection.");
}
export async function connect(code: string, data: AppData, create = false, resumeGeneration?: string, reconnectGeneration?: string, signupNonce?: string) {
  const credentials = await recoveryCredentials(code);
  let headers: Record<string, string> | undefined;
  if (resumeGeneration) headers = { "X-Drip-Resume": resumeGeneration };
  else if (reconnectGeneration) headers = { "X-Drip-Reconnect": reconnectGeneration };
  if (signupNonce) headers = { ...headers, "X-Drip-Signup": signupNonce };
  try {
    let result: { error: unknown; data: { user: { id: string; email: string } } | null } = await authClient.signIn.email({ ...credentials, ...(headers ? { fetchOptions: { headers, timeout: 8000, retry: 0 } } : {}) });
    const error = result.error as { status?: number; code?: string } | null;
    // Only an unknown recovery identity permits explicit registration. Outages,
    // denied requests and device/session failures must never trigger signup.
    if (create && error?.status === 401 && error.code === "INVALID_EMAIL_OR_PASSWORD") {
      result = await authClient.signUp.email({ ...credentials, name: data.identity?.handle ?? "Drip user", ...(headers ? { fetchOptions: { headers, timeout: 8000, retry: 0 } } : {}) });
    }
    if (result.error || !result.data?.user) throw authFailure(result.error, create);
    return { user: result.data.user, key: await cloudKey(code) };
  } catch (error) {
    // Keep local session/worker safety instructions; hide transport internals.
    if (error instanceof TypeError || (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))) throw new Error("Could not reach Drip. Check your connection and try again.");
    throw error;
  }
}

export async function restoreCloud(code: string, userId?: string, resumeGeneration?: string, retained?: RetainedAccount) {
  const device = await getItem<{ signedOut: boolean; generation: string }>("deviceSession");
  if (device?.signedOut && device.generation !== resumeGeneration) throw new Error("Sign in before restoring accounts.");
  const credentials = await recoveryCredentials(code);
  const sessionOptions = resumeGeneration ? { fetchOptions: { headers: { "X-Drip-Resume": resumeGeneration } } } : undefined;
  const session = userId ? await authClient.getSession(sessionOptions) : { data: null };
  // A passkey session must match the recovery code's account, not merely any session.
  if (userId && (session.data?.user.id !== userId || session.data?.user.email !== credentials.email)) throw new Error("That recovery code belongs to a different account.");
  const account = userId ? { user: session.data!.user, key: await cloudKey(code) } : await connect(code, {} as AppData, false, resumeGeneration);
  const remote = await vault("GET", undefined, account.user.id, resumeGeneration);
  if (!remote.envelope) throw new Error("No cloud copy exists yet. Use your exported backup or original device.");
  let data = await unseal(remote.envelope, account.key);
  const local = await cloudSnapshot();
  const localVerifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (local.data.identity?.id === data.identity!.id && localVerifier && await checkCode(code, localVerifier)) {
    const labels = new Map(local.data.accounts.map(a => [a.id, a.label]));
    data = { ...data, accounts: data.accounts.map(a => ({ ...a, label: labels.get(a.id) ?? "" })) };
  }
  await commitCloudRestore(data, { userId: account.user.id, identityId: data.identity!.id, key: account.key, version: remote.version, dirty: false, lastSyncAt: remote.updated_at ?? new Date().toISOString(), generation: crypto.randomUUID(), revision: 0 }, await codeVerifier(code), device?.generation, resumeGeneration, code, undefined, undefined, retained);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-cloud-changed"));
  return data;
}

let syncing = false;
export async function syncNow(): Promise<string> {
  if (syncing) return "Sync already in progress.";
  syncing = true;
  try {
    const { state, data: snapshot, signedOut } = await cloudSnapshot();
    if (signedOut) return "Signed out. Cloud sync is paused.";
    if (!state) return "Cloud recovery is off.";
    const session = await authClient.getSession();
    if (session.error?.status === 429) throw new Error("Cloud sync is temporarily rate limited. Drip will retry automatically; your local data is safe.");
    if (session.error) throw new Error("Could not check cloud sign-in. Drip will retry automatically; your local data is safe.");
    if (session.data?.user.id !== state.userId) throw new Error("Sign in again to sync. Your local data is safe.");
    const data = migrateData(snapshot, new Date().toISOString().slice(0, 10));
    if (data.identity?.id !== state.identityId) throw new Error("This local backup belongs to another account. Disconnect cloud recovery first.");
    const remote = await vault("GET", undefined, state.userId);
    if (remote.version !== state.version) throw new Error("Cloud changed on another device. Export a local backup, then restore the cloud copy before saving again.");
    // Replace older cloud copies that included device-only nicknames, even when
    // no financial edits are queued. This leaves this device's labels intact.
    const previous = remote.envelope ? await decode(remote.envelope, state.key) : undefined;
    const needsCleanup = previous && JSON.stringify(cloudPayload(previous)) !== JSON.stringify(previous);
    if (!state.dirty && !needsCleanup) {
      const latest = await cloudSnapshot();
      if (latest.signedOut || latest.state?.generation !== state.generation || latest.state.vaultId !== state.vaultId) return "Cloud connection changed during sync. Check its status before continuing.";
      return latest.state.revision === state.revision && !latest.state.dirty ? "Cloud copy is up to date." : "Saved on this device. Changes are waiting to sync.";
    }
    const envelope = await seal(data, state.key);
    const current = await cloudSnapshot();
    if (current.signedOut) return "Signed out. Cloud sync is paused.";
    // Encryption yields: a restore/reconnect may have replaced this snapshot even
    // when the server version is unchanged. Reject it before writing remotely.
    if (current.state?.userId !== state.userId || current.state.identityId !== state.identityId ||
      current.state.generation !== state.generation || current.state.version !== state.version) {
      return "Cloud connection changed during sync. Check its status before continuing.";
    }
    const saved = await vault("PUT", { version: state.version, envelope }, state.userId);
    const acknowledged = await acknowledgeCloudUpload(state, saved.version, saved.updated_at ?? new Date().toISOString());
    const messages = {
      queued: "Cloud copy saved; newer local changes are queued.",
      changed: "Cloud connection changed during sync. Check its status before continuing.",
      saved: "Encrypted cloud copy saved.",
    };
    return messages[acknowledged];
  } finally { syncing = false; }
}
