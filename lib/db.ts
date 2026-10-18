import type { AppData, CloudState } from "./types";
import { migrateData } from "./maths";
import { isIdentity } from "./identity";
import { validProductFields } from "./products";
import { checkCode, codeVerifier } from "./crypto";
import { createVault, openVault, encryptLocal, decryptLocal, type LocalKeys, type VaultHeader, type LocalEnvelope } from "./local-vault";
import type { PasskeyWrap } from "./passkey-crypto";

const DB = "drip", STORE = "kv", KEY = "data";
export const emptyData = (): AppData => ({ version: 1, accounts: [], snapshots: [], lastBackupAt: null });
type Device = { signedOut: boolean; generation: string };
type Metadata = Omit<CloudState, "key">;
type Stored = { data?: AppData | LocalEnvelope; cloud?: Metadata; vault?: VaultHeader; gate?: Device; verifier?: { salt: string; hash: string }; passkey?: PasskeyWrap };
export interface VaultBinding { vaultId: string; generation?: string; passkeyCiphertext?: string | null }
function checkBinding(value: Stored, expected: VaultBinding) {
  if (value.vault?.id !== expected.vaultId || value.gate?.generation !== expected.generation ||
    (expected.passkeyCiphertext !== undefined && (value.passkey?.ct ?? null) !== expected.passkeyCiphertext)) throw new Error("Device session changed. Unlock Drip again before continuing.");
}
let unlocked: { keys: LocalKeys; generation?: string } | undefined;
let epoch = 0;
let writes: Promise<unknown> = Promise.resolve();
let lastWrite: Promise<void> = Promise.resolve();
let closing = false;
export class VaultLockedError extends Error { constructor() { super("Unlock Drip with your recovery code first."); } }
export function lockLocalVault(force = false) { if (unlocked || force) { unlocked = undefined; epoch++; } }
export async function prepareLocalSignOut() { closing = true; try { await lastWrite; } catch (error) { closing = false; throw error; } }
export function cancelLocalSignOut() { closing = false; }
export async function clearOnboardingDraft() { await tx("readwrite", s => s.delete("onboardingDraft")); }

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    // Version 2 also prevents legacy v1 clients from overwriting encrypted records.
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
    r.onerror = () => rej(new Error("Could not open local storage.", { cause: r.error }));
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(new Error("Local storage transaction failed.", { cause: t.error })); };
  });
}
async function stored(): Promise<Stored> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readonly"); const s = t.objectStore(STORE);
    const data = s.get(KEY), cloud = s.get("cloudState"), vault = s.get("localVault"), gate = s.get("deviceSession"), verifier = s.get("verifier"), passkey = s.get("passkeyUnlock");
    t.oncomplete = () => { db.close(); resolve({ data: data.result, cloud: cloud.result, vault: vault.result, gate: gate.result, verifier: verifier.result, passkey: passkey.result }); };
    t.onerror = t.onabort = () => { db.close(); reject(new Error("Could not read local storage.", { cause: t.error })); };
  });
}
function current(value: Stored, allowSignedOut = false) {
  const local = unlocked;
  if (!local || value.vault?.id !== local.keys.header.id || value.gate?.generation !== local.generation || (!allowSignedOut && value.gate?.signedOut)) throw new VaultLockedError();
  return local;
}
const metadata = (value: CloudState | undefined): Metadata | undefined => value ? {
  userId: value.userId, identityId: value.identityId, version: value.version,
  dirty: value.dirty, lastSyncAt: value.lastSyncAt, generation: value.generation, revision: value.revision,
} : undefined;
const connected = (value: Metadata | undefined, keys: LocalKeys): CloudState | undefined => value ? { ...value, key: keys.cloudKey } : undefined;

export async function localVaultStatus(): Promise<"new" | "migration" | "locked" | "unlocked"> {
  const value = await stored();
  if (unlocked && (value.vault?.id !== unlocked.keys.header.id || value.gate?.generation !== unlocked.generation)) lockLocalVault();
  if (!value.vault) return value.data || value.verifier ? "migration" : "new";
  try { current(value); return "unlocked"; } catch { return "locked"; }
}
export async function hasCloudConnection() { return !!(await tx("readonly", s => s.get("cloudState"))); }
export async function getItem<T>(key: string): Promise<T | undefined> {
  if (key === KEY) return (await loadData()) as T;
  if (key === "cloudState") {
    const value = await stored(); if (!value.cloud) return undefined;
    return connected(value.cloud, current(value).keys) as T;
  }
  if (key === "localVault") throw new Error("Use the local vault interface.");
  return tx("readonly", s => s.get(key));
}
export async function setItem(key: string, value: unknown): Promise<void> {
  if ([KEY, "cloudState", "localVault", "onboardingDraft", "passkeyUnlock"].includes(key)) throw new Error("Use the encrypted storage interface.");
  await tx("readwrite", s => s.put(value, key));
  if (key === "deviceSession" && (value as Device)?.signedOut) lockLocalVault(true);
}
export async function loadData(): Promise<AppData> {
  const value = await stored(); if (!value.data) return emptyData();
  const local = current(value); const stamp = epoch;
  const data = await decryptLocal<AppData>(value.data as LocalEnvelope, local.keys);
  if (stamp !== epoch) throw new VaultLockedError();
  current(await stored());
  if (!isAppData(data)) throw new Error("Invalid local data. Your stored copy has not changed.");
  return migrateData(data, new Date().toISOString().slice(0, 10));
}

/** Unwrap only in memory. Legacy plaintext is removed only after verified encryption. */
export async function unlockLocalVault(root: string, expected?: VaultBinding): Promise<{ data: AppData; state?: CloudState }> {
  const before = await stored(); const stamp = epoch;
  if (expected) checkBinding(before, expected);
  if (before.verifier && !(await checkCode(root, before.verifier))) throw new Error("That isn't your recovery code.");
  const keys = before.vault ? await openVault(before.vault, root) : await createVault(root);
  const legacyCloudKey = !before.vault && (before.cloud as CloudState | undefined)?.key;
  if (legacyCloudKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const probe = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, legacyCloudKey, new Uint8Array([1, 2, 3]));
    try { await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keys.cloudKey, probe); }
    catch { throw new Error("The recovery code does not match the cloud key. Your original local copy has not changed."); }
  }
  const data = before.vault ? await decryptLocal<AppData>(before.data as LocalEnvelope, keys) : before.data as AppData ?? emptyData();
  if (!isAppData(data)) throw new Error("Invalid local data. Your stored copy has not changed.");
  const encrypted = before.vault ? before.data as LocalEnvelope : await encryptLocal(data, keys);
  if (!before.vault && JSON.stringify(await decryptLocal(encrypted, keys)) !== JSON.stringify(data)) throw new Error("Local encryption verification failed.");
  const verifier = before.verifier ?? await codeVerifier(root);
  await guardedWrite(before, stamp, (s) => {
    if (!before.vault) {
      s.put(keys.header, "localVault"); s.put(encrypted, KEY); s.put(verifier, "verifier");
      s.put(metadata(before.cloud as CloudState | undefined), "cloudState");
    }
    s.delete("onboardingDraft");
  }, true, false, expected?.passkeyCiphertext !== undefined);
  if (stamp !== epoch) throw new VaultLockedError();
  unlocked = { keys, generation: before.gate?.generation };
  closing = false;
  lastWrite = Promise.resolve();
  const latest = await stored(); current(latest, true);
  const fresh = await decryptLocal<AppData>(latest.data as LocalEnvelope, keys);
  if (stamp !== epoch) throw new VaultLockedError();
  return { data: migrateData(fresh, new Date().toISOString().slice(0, 10)), state: connected(latest.cloud, keys) };
}

/** Only ciphertext and public credential metadata survive a reload or sign-out. */
export async function passkeyUnlockContext() {
  const value = await stored();
  if (!value.vault) throw new Error("Unlock your encrypted accounts with a recovery code first.");
  const binding: VaultBinding = { vaultId: value.vault.id, generation: value.gate?.generation, passkeyCiphertext: value.passkey?.ct ?? null };
  return { binding, wrap: value.passkey?.vaultId === value.vault.id ? value.passkey : undefined };
}
export async function savePasskeyUnlock(wrap: PasskeyWrap | undefined, expected: VaultBinding) {
  const before = await stored(); const stamp = epoch;
  checkBinding(before, expected); current(before);
  if (wrap && wrap.vaultId !== expected.vaultId) throw new Error("Passkey belongs to another local vault.");
  await guardedWrite(before, stamp, s => { if (wrap) s.put(wrap, "passkeyUnlock"); else s.delete("passkeyUnlock"); }, false, false, true);
}

/** Compare snapshots inside the write transaction after asynchronous crypto finishes. */
async function guardedWrite(before: Stored, stamp: number, write: (s: IDBObjectStore, cloud?: Metadata) => void, allowSignedOut = false, requireUnchangedRecords = false, requireUnchangedPasskey = false): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE); let failure: Error | undefined;
    const gate = s.get("deviceSession"), vault = s.get("localVault"), data = s.get(KEY), cloud = s.get("cloudState"), passkey = s.get("passkeyUnlock");
    passkey.onsuccess = () => {
      if (stamp !== epoch || gate.result?.generation !== before.gate?.generation || (!allowSignedOut && gate.result?.signedOut) ||
        vault.result?.id !== before.vault?.id) {
        failure = new Error("Device session changed. Unlock Drip again before continuing."); t.abort(); return;
      }
      if (requireUnchangedPasskey && JSON.stringify(passkey.result) !== JSON.stringify(before.passkey)) {
        failure = new Error("Passkey setup changed. Unlock Drip again before continuing."); t.abort(); return;
      }
      // Replacing a vault must not discard an edit or sync result committed while
      // asynchronous key derivation/encryption was running, including in other tabs.
      if ((!before.vault || requireUnchangedRecords) && (JSON.stringify(data.result) !== JSON.stringify(before.data) || JSON.stringify(cloud.result) !== JSON.stringify(before.cloud))) {
        failure = new Error("Local data changed while preparing the replacement. Your current copy is kept; review it and retry."); t.abort(); return;
      }
      try { write(s, cloud.result); }
      catch (error) { failure = error instanceof Error ? error : new Error("Local storage write failed."); t.abort(); }
    };
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = t.onabort = () => { db.close(); reject(failure ?? new Error("Local storage write failed.", { cause: t.error })); };
  });
}
export function saveData(data: AppData): Promise<void> {
  if (closing) return Promise.reject(new Error("Sign-out is in progress. Unlock Drip before editing."));
  // Preserve invocation order even when encryption yields.
  const stamp = epoch;
  const save = writes.then(async () => {
    if (stamp !== epoch) throw new VaultLockedError();
    const before = await stored(); const local = current(before);
    const encrypted = await encryptLocal(data, local.keys);
    await guardedWrite(before, stamp, (s, cloud) => {
      s.put(encrypted, KEY);
      if (cloud) s.put({ ...cloud, dirty: true, revision: cloud.revision + 1 }, "cloudState");
    });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-data-saved"));
  });
  lastWrite = save; writes = save.catch(() => {}); return save;
}
export async function cloudSnapshot(): Promise<{ data: AppData; state: CloudState | undefined; signedOut: boolean }> {
  const value = await stored();
  let local: NonNullable<typeof unlocked>;
  try { local = current(value); } catch { return { data: emptyData(), state: undefined, signedOut: !!(value.data || value.vault || value.gate?.signedOut) }; }
  const stamp = epoch;
  const data = value.data ? await decryptLocal<AppData>(value.data as LocalEnvelope, local.keys) : emptyData();
  if (stamp !== epoch) return { data: emptyData(), state: undefined, signedOut: true };
  current(await stored());
  return { data, state: connected(value.cloud, local.keys), signedOut: false };
}
export async function acknowledgeCloudUpload(expected: CloudState, version: number, at: string): Promise<"saved" | "queued" | "changed"> {
  const before = await stored();
  try { current(before); } catch { return "changed"; }
  let result: "saved" | "queued" | "changed" = "changed";
  await guardedWrite(before, epoch, (s, cloud) => {
    if (cloud?.userId !== expected.userId || cloud.generation !== expected.generation || cloud.version !== expected.version) return;
    const dirty = cloud.revision !== expected.revision;
    s.put({ ...cloud, version, dirty, lastSyncAt: at }, "cloudState"); result = dirty ? "queued" : "saved";
  });
  return result;
}
export async function commitCloudRestore(data: AppData, state: CloudState | undefined, verifier: { salt: string; hash: string }, expectedGeneration?: string, resumeGeneration?: string, root?: string): Promise<void> {
  if (!isAppData(data)) throw new Error("Invalid local data. Your stored copy has not changed.");
  const before = await stored(); const stamp = epoch;
  if ((before.gate?.signedOut && before.gate.generation !== resumeGeneration) || before.gate?.generation !== expectedGeneration) throw new Error("Device session changed. Sign in again before restoring.");
  const keys = root ? await createVault(root) : current(before, !!resumeGeneration).keys;
  const encrypted = await encryptLocal(data, keys);
  if (JSON.stringify(await decryptLocal(encrypted, keys)) !== JSON.stringify(data)) throw new Error("Local encryption verification failed.");
  const generation = resumeGeneration ? crypto.randomUUID() : before.gate?.generation;
  await guardedWrite(before, stamp, s => {
    s.put(encrypted, KEY); s.put(keys.header, "localVault"); s.put(metadata(state), "cloudState"); s.put(verifier, "verifier"); s.delete("onboardingDraft");
    if (keys.header.id !== before.vault?.id) s.delete("passkeyUnlock");
    if (resumeGeneration) s.put({ signedOut: false, remotePending: false, generation }, "deviceSession");
  }, !!resumeGeneration, true);
  if (stamp !== epoch) throw new VaultLockedError();
  epoch++; // Pending writes belong to the copy the user just replaced.
  unlocked = { keys, generation };
  closing = false;
  lastWrite = Promise.resolve();
}

/** Validates an imported object before it replaces local data. */
export function isAppData(x: unknown): x is AppData {
  const d = x as AppData;
  return !!d && d.version === 1 && Array.isArray(d.accounts) && Array.isArray(d.snapshots) &&
    (d.projection === undefined || (!!d.projection && Number.isFinite(d.projection.monthlyDeposit) && d.projection.monthlyDeposit >= 0 && d.projection.monthlyDeposit <= 1_000_000 && [1, 3, 5].includes(d.projection.years))) &&
    (d.identity === undefined || isIdentity(d.identity)) && d.accounts.every((a) => !!a && typeof a.id === "string" && Number.isFinite(a.balance) && Number.isFinite(a.ratePct) && validProductFields(a));
}
export async function completeDeviceSession(generation: string, value: unknown): Promise<boolean> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE); let changed = false;
    const request = s.get("deviceSession");
    request.onsuccess = () => { if (request.result?.generation === generation) { s.put(value, "deviceSession"); changed = true; } };
    t.oncomplete = () => { db.close(); resolve(changed); };
    t.onerror = t.onabort = () => { db.close(); reject(new Error("Could not update the device session.", { cause: t.error })); };
  });
}
export async function storeCloudConnection(state: CloudState | undefined, expectedGeneration?: string, expectedConnectionGeneration?: string): Promise<void> {
  const before = await stored(); current(before);
  if (before.gate?.generation !== expectedGeneration) throw new Error("Device session changed. Sign in again before connecting cloud recovery.");
  await guardedWrite(before, epoch, (s, cloud) => {
    if (expectedConnectionGeneration !== undefined && cloud?.generation !== expectedConnectionGeneration) throw new Error("Cloud connection changed. Check its status before disconnecting.");
    s.put(metadata(state), "cloudState");
  });
}
