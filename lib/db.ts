import type { AppData } from "./types";
import { migrateData } from "./maths";

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
export async function saveData(d: AppData): Promise<void> { await setItem(KEY, d); }

/** Validates an imported object before it replaces local data. */
export function isAppData(x: unknown): x is AppData {
  const d = x as AppData;
  return !!d && d.version === 1 && Array.isArray(d.accounts) && Array.isArray(d.snapshots) &&
    d.accounts.every((a) => typeof a.id === "string" && typeof a.balance === "number" && typeof a.ratePct === "number");
}
