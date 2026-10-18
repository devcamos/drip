import { commitCloudRestore, emptyData } from "../lib/db";
import { codeVerifier } from "../lib/crypto";
import type { AppData, CloudState } from "../lib/types";
export const fixtureCode = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF";
export async function seedVault(data: AppData = emptyData(), code = fixtureCode, state?: CloudState) {
  await commitCloudRestore(data, state, await codeVerifier(code), undefined, undefined, code);
}
// Raw access is deliberately confined to test fixtures and at-rest assertions.
export async function rawStore(values?: Record<string, unknown>): Promise<Record<string, any>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("drip"); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("Could not open test storage.", { cause: r.error }));
  });
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", values ? "readwrite" : "readonly"); const s = t.objectStore("kv");
    if (values) for (const [key, value] of Object.entries(values)) s.put(value, key);
    const keys = s.getAllKeys(), records = s.getAll();
    t.oncomplete = () => {
      db.close();
      try {
        const entries = keys.result.map((key, i) => {
          if (typeof key !== "string") throw new Error("Drip's key-value store must use string keys.");
          return [key, records.result[i]];
        });
        resolve(Object.fromEntries(entries));
      } catch (error) { reject(new Error("Could not read test storage keys.", { cause: error })); }
    };
    t.onerror = t.onabort = () => { db.close(); reject(new Error("Test storage transaction failed.", { cause: t.error })); };
  });
}
