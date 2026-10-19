import { expect, type Page } from "@playwright/test";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";

// Existing-account fixtures stay independent of cloud signup. They exercise the
// real legacy migration gate; the password suite covers actual new registration.
export async function legacyAccount(page: Page, handle = "devo") {
  const code = generateRecoveryCode();
  const verifier = await codeVerifier(code);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.evaluate(async ({ verifier, handle }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("Could not open the legacy test fixture.", { cause: r.error })); });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("kv", "readwrite"), s = t.objectStore("kv");
      s.put({ version: 1, accounts: [], snapshots: [], lastBackupAt: null, identity: { id: crypto.randomUUID(), handle, createdAt: new Date().toISOString() } }, "data");
      s.put(verifier, "verifier");
      t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => { db.close(); reject(new Error("Could not store the legacy test fixture.", { cause: t.error })); };
    });
  }, { verifier, handle });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Encrypt this device" })).toBeVisible();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Encrypt local data", exact: true }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  return code;
}
