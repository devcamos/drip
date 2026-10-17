import type { AppData, CloudState } from "./types";
import { migrateData } from "./maths";
import { isIdentity } from "./identity";

const DB = "drip", STORE = "kv", KEY = "data";
export const emptyData = (): AppData => ({ version: 1, accounts: [], snapshots: [], lastBackupAt: null });

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}

export async function getItem<T>(key: string): Promise<T | undefined> { return tx("readonly", (s) => s.get(key)); }
export async function setItem(key: string, value: unknown): Promise<void> { await tx("readwrite", (s) => s.put(value, key)); }

export async function loadData(): Promise<AppData> {
  const d = await getItem<AppData>(KEY);
  return d ? migrateData(d, new Date().toISOString().slice(0, 10)) : emptyData();
}
export async function saveData(d: AppData): Promise<void> {
  // Data and pending-upload marker commit together, including when offline.
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite"); const store = t.objectStore(STORE);
    store.put(d, KEY);
    const request = store.get("cloudState");
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, dirty: true, revision: request.result.revision + 1 }, "cloudState"); };
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("drip-data-saved"));
}

/** Read account data and its upload revision from one consistent transaction. */
export async function cloudSnapshot(): Promise<{ data: AppData; state: CloudState | undefined }> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"); const store = tx.objectStore(STORE);
    const data = store.get(KEY); const state = store.get("cloudState");
    tx.oncomplete = () => { db.close(); resolve({ data: data.result ?? emptyData(), state: state.result }); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

/** Clear only the revision actually uploaded, without crossing a reconnect/restore. */
export async function acknowledgeCloudUpload(expected: CloudState, version: number, at: string): Promise<"saved" | "queued" | "changed"> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE);
    let result: "saved" | "queued" | "changed" = "changed";
    const request = store.get("cloudState");
    request.onsuccess = () => {
      const current = request.result as CloudState | undefined;
      if (!current || current.userId !== expected.userId || current.generation !== expected.generation || current.version !== expected.version) return;
      const dirty = current.revision !== expected.revision;
      store.put({ ...current, version, dirty, lastSyncAt: at }, "cloudState");
      result = dirty ? "queued" : "saved";
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

/** A crash during recovery must not leave accounts without their verifier/key. */
export async function commitCloudRestore(data: AppData, state: unknown, verifier: { salt: string; hash: string }): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE);
    store.put(data, KEY); store.put(state, "cloudState"); store.put(verifier, "verifier"); store.delete("onboardingDraft");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

/** Validates an imported object before it replaces local data. */
export function isAppData(x: unknown): x is AppData {
  const d = x as AppData;
  return !!d && d.version === 1 && Array.isArray(d.accounts) && Array.isArray(d.snapshots) &&
    (d.projection === undefined || (!!d.projection && Number.isFinite(d.projection.monthlyDeposit) && d.projection.monthlyDeposit >= 0 && d.projection.monthlyDeposit <= 1_000_000 && [1, 3, 5].includes(d.projection.years))) &&
    (d.identity === undefined || isIdentity(d.identity)) && d.accounts.every((a) => typeof a.id === "string" && typeof a.balance === "number" && typeof a.ratePct === "number");
}
