import type { AppData, CloudState } from "./types";
import { migrateData } from "./maths";
import { isIdentity } from "./identity";
import { validProductFields } from "./products";
import { checkCode, codeVerifier } from "./crypto";
import { createVault, openVault, encryptLocal, decryptLocal, type LocalKeys, type VaultHeader, type LocalEnvelope } from "./local-vault";
import type { PasskeyWrap } from "./passkey-crypto";
import type { PasswordWrap } from "./password-crypto";

const DB = "drip", STORE = "kv", KEY = "data";
export const emptyData = (): AppData => ({ version: 1, accounts: [], snapshots: [], lastBackupAt: null });
type Device = { signedOut: boolean; generation: string; remotePending?: boolean; signupNonce?: string };
type Metadata = Omit<CloudState, "key">;
type Stored = { data?: AppData | LocalEnvelope; cloud?: Metadata; vault?: VaultHeader; gate?: Device; verifier?: { salt: string; hash: string }; passkey?: PasskeyWrap; password?: { vaultId: string; envelope: PasswordWrap }; signupRecovery?: { vaultId: string } };
export interface VaultBinding { vaultId: string; generation?: string; passkeyCiphertext?: string | null; passwordCiphertext?: string | null }
export interface RetainedAccount { vaultId: string; generation?: string; records: string }
function checkBinding(value: Stored, expected: VaultBinding) {
  if (value.vault?.id !== expected.vaultId || value.gate?.generation !== expected.generation ||
    (expected.passkeyCiphertext !== undefined && (value.passkey?.ct ?? null) !== expected.passkeyCiphertext) ||
    (expected.passwordCiphertext !== undefined && (value.password?.envelope.ct ?? null) !== expected.passwordCiphertext)) throw new Error("Device session changed. Unlock Drip again before continuing.");
}
let unlocked: { keys: LocalKeys; generation?: string; signupRoot?: string } | undefined;
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
    const data = s.get(KEY), cloud = s.get("cloudState"), vault = s.get("localVault"), gate = s.get("deviceSession"), verifier = s.get("verifier"), passkey = s.get("passkeyUnlock"), password = s.get("passwordUnlock"), signupRecovery = s.get("signupRecoveryRequired");
    t.oncomplete = () => { db.close(); resolve({ data: data.result, cloud: cloud.result, vault: vault.result, gate: gate.result, verifier: verifier.result, passkey: passkey.result, password: password.result, signupRecovery: signupRecovery.result }); };
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
/** Public browser identifier, independent of accounts/keys and shared atomically by tabs. */
export async function browserDeviceId(): Promise<string> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"), s = t.objectStore(STORE);
    const request = s.get("browserDeviceId"); let id: string;
    request.onsuccess = () => {
      id = typeof request.result === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.result) ? request.result : crypto.randomUUID();
      if (id !== request.result) s.put(id, "browserDeviceId");
    };
    t.oncomplete = () => { db.close(); resolve(id); };
    t.onerror = t.onabort = () => { db.close(); reject(new Error("Could not identify this browser. Try again.", { cause: t.error })); };
  });
}
export async function setItem(key: string, value: unknown): Promise<void> {
  if ([KEY, "cloudState", "localVault", "onboardingDraft", "passkeyUnlock", "passwordUnlock"].includes(key)) throw new Error("Use the encrypted storage interface.");
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
  }, { allowSignedOut: true, passkey: expected?.passkeyCiphertext !== undefined, password: expected?.passwordCiphertext !== undefined });
  if (stamp !== epoch) throw new VaultLockedError();
  unlocked = { keys, generation: before.gate?.generation, signupRoot: before.signupRecovery?.vaultId === keys.header.id ? root : undefined };
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
  await guardedWrite(before, stamp, s => { if (wrap) s.put(wrap, "passkeyUnlock"); else s.delete("passkeyUnlock"); }, { passkey: true });
}

export async function passwordUnlockContext() {
  const value = await stored();
  return {
    binding: value.vault ? { vaultId: value.vault.id, generation: value.gate?.generation, passwordCiphertext: value.password?.envelope.ct ?? null } satisfies VaultBinding : undefined,
    envelope: value.password?.vaultId === value.vault?.id ? value.password?.envelope : undefined,
    switchGuard: value.vault ? { vaultId: value.vault.id, generation: value.gate?.generation, records: signupRecords(value) } satisfies RetainedAccount : undefined,
    canReplace: !!value.cloud && !value.cloud.dirty && value.cloud.version > 0,
  };
}
export async function savePasswordUnlock(envelope: PasswordWrap, expected: VaultBinding) {
  const before = await stored(); const stamp = epoch; checkBinding(before, expected); current(before);
  await guardedWrite(before, stamp, s => { s.put({ vaultId: expected.vaultId, envelope }, "passwordUnlock"); }, { password: true });
}

/** Keep the first encrypted code file across retries and competing tabs. */
export async function rememberOriginalRecoveryCodes(ownerId: string, envelope: import("./crypto").BackupFile, expected: VaultBinding) {
  const before = await stored(); const stamp = epoch; checkBinding(before, expected); current(before);
  if (before.cloud?.userId !== ownerId) throw new Error("Cloud account changed. Sign in again.");
  let original: import("./crypto").BackupFile;
  await guardedWrite(before, stamp, (store, cloud) => {
    if (cloud?.userId !== ownerId) throw new Error("Cloud account changed. Sign in again.");
    const key = `originalRecoveryCodes:${ownerId}`; const read = store.get(key);
    read.onsuccess = () => {
      original = read.result ?? envelope;
      if (!read.result) store.put(envelope, key);
    };
  });
  return original!;
}

/** Reuse only the authenticated, unfinished signup's in-memory key. Never persist it. */
export async function signupRecoveryContext() {
  const value = await stored(); const local = current(value);
  if (value.signupRecovery?.vaultId !== local.keys.header.id || !local.signupRoot || !value.cloud?.userId || value.cloud.version < 1) throw new Error("Sign in again to finish saving your recovery codes.");
  return { root: local.signupRoot, ownerId: value.cloud.userId, vaultId: local.keys.header.id, generation: value.gate?.generation };
}

/** Confirmation and the signup checkpoint complete in one guarded transaction. */
export async function saveRecoveryCodesConfirmation(expectedVaultId: string | undefined) {
  const before = await stored(); const stamp = epoch; const local = current(before);
  if (!expectedVaultId || before.vault?.id !== expectedVaultId) throw new Error("Your account changed. Open recovery codes for the current account.");
  await guardedWrite(before, stamp, store => {
    store.put({ vaultId: expectedVaultId, savedAt: new Date().toISOString() }, "recoveryCodesSaved");
    store.delete("signupRecoveryRequired");
  });
  delete local.signupRoot;
}

/** Compare snapshots inside the write transaction after asynchronous crypto finishes. */
async function guardedWrite(before: Stored, stamp: number, write: (s: IDBObjectStore, cloud?: Metadata) => void, options: { allowSignedOut?: boolean; records?: boolean; passkey?: boolean; password?: boolean; signup?: SignupReplacement; retained?: RetainedAccount } = {}): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE); let failure: Error | undefined;
    const gate = s.get("deviceSession"), vault = s.get("localVault"), data = s.get(KEY), cloud = s.get("cloudState"), passkey = s.get("passkeyUnlock"), password = s.get("passwordUnlock"), verifier = s.get("verifier");
    verifier.onsuccess = () => {
      if (stamp !== epoch || gate.result?.generation !== before.gate?.generation || (!options.allowSignedOut && gate.result?.signedOut) ||
        vault.result?.id !== before.vault?.id) {
        failure = new Error("Device session changed. Unlock Drip again before continuing."); t.abort(); return;
      }
      if (options.signup && (gate.result?.signedOut !== true || gate.result?.signupNonce !== options.signup.nonce ||
        gate.result?.generation !== options.signup.generation || signupRecords({ vault: vault.result, data: data.result, cloud: cloud.result, verifier: verifier.result, passkey: passkey.result, password: password.result }) !== options.signup.records)) {
        failure = new Error("Your current account changed during signup. Its local copy is kept; sign in and retry."); t.abort(); return;
      }
      if (options.retained && (!cloud.result || cloud.result.dirty || cloud.result.version < 1 ||
        signupRecords({ vault: vault.result, data: data.result, cloud: cloud.result, verifier: verifier.result, passkey: passkey.result, password: password.result }) !== options.retained.records)) {
        failure = new Error("Your saved account changed. Its local copy is kept; review it and sign in again."); t.abort(); return;
      }
      if ((options.passkey && JSON.stringify(passkey.result) !== JSON.stringify(before.passkey)) ||
        (options.password && JSON.stringify(password.result) !== JSON.stringify(before.password))) {
        failure = new Error("Passkey setup changed. Unlock Drip again before continuing."); t.abort(); return;
      }
      // Replacing a vault must not discard an edit or sync result committed while
      // asynchronous key derivation/encryption was running, including in other tabs.
      if ((!before.vault || options.records) && (JSON.stringify(data.result) !== JSON.stringify(before.data) || JSON.stringify(cloud.result) !== JSON.stringify(before.cloud))) {
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
  if (!isAppData(data)) return Promise.reject(new Error("These changes contain invalid amounts. Your saved data is unchanged."));
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
type UploadState = CloudState & { vaultId: string };
export async function cloudSnapshot(): Promise<{ data: AppData; state: UploadState | undefined; signedOut: boolean }> {
  const value = await stored();
  let local: NonNullable<typeof unlocked>;
  try { local = current(value); } catch { return { data: emptyData(), state: undefined, signedOut: !!(value.data || value.vault || value.gate?.signedOut) }; }
  const stamp = epoch;
  const data = value.data ? await decryptLocal<AppData>(value.data as LocalEnvelope, local.keys) : emptyData();
  if (stamp !== epoch) return { data: emptyData(), state: undefined, signedOut: true };
  current(await stored());
  const state = connected(value.cloud, local.keys);
  // Bind upload receipts to the original local vault without persisting its ID
  // in cloud metadata or relying on keys still being available after sign-out.
  return { data, state: state ? { ...state, vaultId: local.keys.header.id } : undefined, signedOut: false };
}
export async function acknowledgeCloudUpload(expected: UploadState, version: number, at: string): Promise<"saved" | "queued" | "changed"> {
  if (!expected.vaultId) return "changed";
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE);
    let result: "saved" | "queued" | "changed" = "changed";
    const vault = s.get("localVault"), state = s.get("cloudState");
    state.onsuccess = () => {
      const cloud = state.result as Metadata | undefined;
      if (vault.result?.id !== expected.vaultId || cloud?.userId !== expected.userId ||
        cloud.identityId !== expected.identityId || cloud.generation !== expected.generation || cloud.version !== expected.version) return;
      // The server already accepted this upload. Record only its version while
      // retaining newer edits and keeping a signed-out/locked vault closed.
      const dirty = cloud.revision !== expected.revision;
      s.put({ ...cloud, version, dirty, lastSyncAt: at }, "cloudState"); result = dirty ? "queued" : "saved";
    };
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = t.onabort = () => { db.close(); reject(new Error("Could not record the cloud upload receipt.", { cause: t.error })); };
  });
}
export interface SignupReplacement { vaultId: string; generation: string; nonce: string; records: string }
const signupRecords = (value: Stored) => JSON.stringify([value.vault, value.data, value.cloud, value.verifier, value.passkey, value.password]);
/** Reserve a signed-out, fully synced copy; retain every encrypted record. */
export async function reserveSignupReplacement(): Promise<SignupReplacement> {
  const before = await stored();
  if (!before.vault || !before.gate?.signedOut || before.gate.remotePending) throw new Error("Finish signing out before creating another account.");
  if (!before.cloud || before.cloud.dirty || before.cloud.version < 1) throw new Error("Sign back in and sync your current account before creating a new one here. You can also sign up in a private browser window and keep this copy.");
  const generation = crypto.randomUUID(), nonce = crypto.randomUUID();
  await guardedWrite(before, epoch, s => s.put({ signedOut: true, remotePending: false, generation, signupNonce: nonce }, "deviceSession"), { allowSignedOut: true, records: true });
  lockLocalVault(true);
  return { vaultId: before.vault.id, generation, nonce, records: signupRecords(before) };
}
export async function commitCloudRestore(data: AppData, state: CloudState | undefined, verifier: { salt: string; hash: string }, expectedGeneration?: string, resumeGeneration?: string, root?: string, signupPassword?: PasswordWrap, replacement?: SignupReplacement, retained?: RetainedAccount): Promise<void> {
  if (!isAppData(data)) throw new Error("Invalid local data. Your stored copy has not changed.");
  const before = await stored(); const stamp = epoch;
  if (retained && (before.vault?.id !== retained.vaultId || before.gate?.generation !== retained.generation || !before.cloud || before.cloud.dirty || before.cloud.version < 1 || signupRecords(before) !== retained.records)) throw new Error("Your saved account changed. Its local copy is kept; review it and sign in again.");
  if (replacement && (!signupPassword || !before.gate?.signedOut || before.gate.generation !== replacement.generation || before.gate.signupNonce !== replacement.nonce || before.vault?.id !== replacement.vaultId || signupRecords(before) !== replacement.records || resumeGeneration !== replacement.generation || before.cloud?.dirty)) throw new Error("Your current account changed during signup. Its local copy is kept; sign in and retry.");
  if (signupPassword && ((!replacement && (before.vault || before.verifier)) || signupPassword.owner !== state?.userId)) throw new Error("This browser already has an account. Sign in instead.");
  if ((before.gate?.signedOut && before.gate.generation !== resumeGeneration) || before.gate?.generation !== expectedGeneration) throw new Error("Device session changed. Sign in again before restoring.");
  const keys = root ? await createVault(root) : current(before, !!resumeGeneration).keys;
  const encrypted = await encryptLocal(data, keys);
  if (JSON.stringify(await decryptLocal(encrypted, keys)) !== JSON.stringify(data)) throw new Error("Local encryption verification failed.");
  const generation = resumeGeneration ? crypto.randomUUID() : before.gate?.generation;
  await guardedWrite(before, stamp, s => {
    s.put(encrypted, KEY); s.put(keys.header, "localVault"); s.put(metadata(state), "cloudState"); s.put(verifier, "verifier"); s.delete("onboardingDraft");
    if (keys.header.id !== before.vault?.id) s.delete("passkeyUnlock");
    if (keys.header.id !== before.vault?.id) s.delete("passwordUnlock");
    if (signupPassword) {
      s.put({ vaultId: keys.header.id, envelope: signupPassword }, "passwordUnlock");
      s.put({ vaultId: keys.header.id }, "signupRecoveryRequired");
    }
    if (resumeGeneration) s.put({ signedOut: false, remotePending: false, generation }, "deviceSession");
  }, { allowSignedOut: !!resumeGeneration, records: true, signup: replacement, retained });
  if (stamp !== epoch) throw new VaultLockedError();
  epoch++; // Pending writes belong to the copy the user just replaced.
  unlocked = { keys, generation, signupRoot: signupPassword ? root : undefined };
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

/** Reserve a fresh browser for password recovery without racing another onboarding. */
export async function claimEmptyPasswordDevice(expectedGeneration?: string): Promise<string> {
  const db = await open(); const generation = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE); let failed = false;
    const gate = s.get("deviceSession"), vault = s.get("localVault"), verifier = s.get("verifier");
    verifier.onsuccess = () => {
      if (gate.result?.generation !== expectedGeneration || vault.result || verifier.result) { failed = true; t.abort(); return; }
      s.put({ signedOut: true, remotePending: false, generation }, "deviceSession");
    };
    t.oncomplete = () => { db.close(); lockLocalVault(true); resolve(generation); };
    t.onabort = t.onerror = () => { db.close(); reject(new Error(failed ? "Device session changed. Try again." : "Could not reserve this device.")); };
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
