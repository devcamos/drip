import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { normaliseCode, isValidCode, codeVerifier } from "./crypto";
import { getItem, isAppData, commitCloudRestore, cloudSnapshot, acknowledgeCloudUpload, storeCloudConnection } from "./db";
import type { AppData, CloudState } from "./types";
export type { CloudState } from "./types";
import { migrateData } from "./maths";
import { safeFetch } from "./worker-safety";

export const authClient = createAuthClient({ plugins: [passkeyClient()], fetchOptions: { customFetchImpl: safeFetch } });
export interface Envelope { app: "drip-cloud"; v: 1; iv: string; ct: string }
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function recoveryCredentials(code: string) {
  if (!isValidCode(code)) throw new Error("Enter your complete recovery code.");
  const normal = normaliseCode(code);
  // Domain separation: the server never receives the encryption root code.
  return {
    email: `${await hash(`drip-recovery-locator-v1:${normal}`)}@recovery.drip.invalid`,
    password: await hash(`drip-recovery-auth-v1:${normal}`),
  };
}
export async function cloudKey(code: string) {
  if (!isValidCode(code)) throw new Error("Enter your complete recovery code.");
  const material = await crypto.subtle.importKey("raw", enc.encode(normaliseCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("drip-cloud-encryption-v1"), iterations: 600_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function seal(data: AppData, key: CryptoKey): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Device screen-lock credentials are not portable and are never restored elsewhere.
  const safe = { ...data, lock: undefined };
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("drip-cloud-v1") }, key, enc.encode(JSON.stringify(safe)));
  return { app: "drip-cloud", v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
export async function unseal(envelope: Envelope, key: CryptoKey): Promise<AppData> {
  if (envelope.app !== "drip-cloud" || envelope.v !== 1) throw new Error("Unsupported cloud copy.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(envelope.iv), additionalData: enc.encode("drip-cloud-v1") }, key, unb64(envelope.ct));
  const data = JSON.parse(new TextDecoder().decode(plain));
  if (!isAppData(data) || !data.identity) throw new Error("Invalid cloud copy.");
  return { ...migrateData(data, new Date().toISOString().slice(0, 10)), lock: undefined };
}
export const readCloudState = () => getItem<CloudState>("cloudState");
export async function writeCloudState(state: CloudState | undefined, expected?: { generation: string | undefined }) {
  const session = await getItem<{ generation: string }>("deviceSession");
  await storeCloudConnection(state, expected ? expected.generation : session?.generation);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-cloud-changed"));
}

export async function vault(method = "GET", body?: unknown, ownerId?: string, resumeGeneration?: string) {
  const response = await safeFetch("/api/cloud", { method, credentials: "same-origin", cache: "no-store", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(ownerId ? { "X-Drip-Owner": ownerId } : {}), ...(resumeGeneration ? { "X-Drip-Resume": resumeGeneration } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(response.status === 409 ? "Cloud changed on another device. Export a local backup, then restore the cloud copy before saving again." : response.status === 401 ? "Sign in again to sync. Your local data is safe." : "Cloud is unavailable. Your local data is safe; try again online.");
  return response.json() as Promise<{ version: number; envelope: Envelope | null; updated_at?: string }>;
}
export async function connect(code: string, data: AppData, create = false, resumeGeneration?: string) {
  const credentials = await recoveryCredentials(code);
  let result: { error: unknown; data: { user: { id: string; email: string } } | null } = await authClient.signIn.email(resumeGeneration ? { ...credentials, fetchOptions: { headers: { "X-Drip-Resume": resumeGeneration } } } : credentials);
  if ((result.error as { status?: number } | null)?.status === 429) throw new Error("Too many sign-in attempts. Wait a few seconds, then try again.");
  if (result.error && create) result = await authClient.signUp.email({ ...credentials, name: data.identity?.handle ?? "Drip user" });
  if (result.error || !result.data?.user) throw new Error("Could not sign in. Check your recovery code and connection.");
  return { user: result.data.user, key: await cloudKey(code) };
}

export async function restoreCloud(code: string, userId?: string, resumeGeneration?: string) {
  const device = await getItem<{ signedOut: boolean; generation: string }>("deviceSession");
  if (device?.signedOut && device.generation !== resumeGeneration) throw new Error("Sign in before restoring accounts.");
  const credentials = await recoveryCredentials(code);
  const session = userId ? await authClient.getSession() : { data: null };
  // A passkey session must match the recovery code's account, not merely any session.
  if (userId && (session.data?.user.id !== userId || session.data?.user.email !== credentials.email)) throw new Error("That recovery code belongs to a different account.");
  const account = userId ? { user: session.data!.user, key: await cloudKey(code) } : await connect(code, {} as AppData, false, resumeGeneration);
  const remote = await vault("GET", undefined, account.user.id, resumeGeneration);
  if (!remote.envelope) throw new Error("No cloud copy exists yet. Use your exported backup or original device.");
  const data = await unseal(remote.envelope, account.key);
  await commitCloudRestore(data, { userId: account.user.id, identityId: data.identity!.id, key: account.key, version: remote.version, dirty: false, lastSyncAt: remote.updated_at ?? new Date().toISOString(), generation: crypto.randomUUID(), revision: 0 }, await codeVerifier(code), device?.generation, resumeGeneration);
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
    if (session.data?.user.id !== state.userId) throw new Error("Sign in again to sync. Your local data is safe.");
    const data = migrateData(snapshot, new Date().toISOString().slice(0, 10));
    if (data.identity?.id !== state.identityId) throw new Error("This local backup belongs to another account. Disconnect cloud recovery first.");
    const remote = await vault("GET", undefined, state.userId);
    if (remote.version !== state.version) throw new Error("Cloud changed on another device. Export a local backup, then restore the cloud copy before saving again.");
    if (!state.dirty) return "Cloud copy is up to date.";
    const envelope = await seal(data, state.key);
    const current = await cloudSnapshot();
    if (current.signedOut) return "Signed out. Cloud sync is paused.";
    // Encryption yields: a restore/reconnect may have replaced this snapshot even
    // when the server version is unchanged. Reject it before writing remotely.
    if (!current.state || current.state.userId !== state.userId || current.state.identityId !== state.identityId ||
      current.state.generation !== state.generation || current.state.version !== state.version) {
      return "Cloud connection changed during sync. Check its status before continuing.";
    }
    const saved = await vault("PUT", { version: state.version, envelope }, state.userId);
    const acknowledged = await acknowledgeCloudUpload(state, saved.version, saved.updated_at ?? new Date().toISOString());
    return acknowledged === "queued" ? "Cloud copy saved; newer local changes are queued." : acknowledged === "changed" ? "Cloud connection changed during sync. Check its status before continuing." : "Encrypted cloud copy saved.";
  } finally { syncing = false; }
}
