import { test, expect, type Page } from "@playwright/test";
import { unlock } from "./vault-helpers";
async function storage(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    return new Promise<{ data: any; cloud: any; draft: any; hasKey: boolean }>((resolve, reject) => {
      const t = db.transaction("kv"); const s = t.objectStore("kv"); const data = s.get("data"), cloud = s.get("cloudState"), draft = s.get("onboardingDraft"), all = s.getAll();
      const containsKey = (value: any): boolean => !!value && typeof value === "object" && (value instanceof CryptoKey || Object.values(value).some(containsKey));
      t.oncomplete = () => { db.close(); resolve({ data: data.result, cloud: cloud.result, draft: draft.result, hasKey: containsKey(all.result) }); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  });
}
test("legacy accounts migrate only with their code and reopen encrypted offline", async ({ page, context }) => {
  const code = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF";
  await page.goto("/"); await expect(page.getByTestId("code")).toBeVisible();
  await page.evaluate(async root => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bytes = new TextEncoder().encode(root.replaceAll("-", ""));
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...salt, ...bytes])));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("kv", "readwrite"); const s = t.objectStore("kv");
      s.put({ version: 1, accounts: [{ id: "legacy", provider: "LegacyPrivateBank", label: "Sensitive legacy pot", balance: 3000, ratePct: 7, rateType: "interest", frequency: "monthly", nextPayoutDate: "2030-01-01", colour: "#2b2d86", payouts: [], createdAt: "2026-01-01" }], snapshots: [], lastBackupAt: null }, "data");
      s.put({ salt: b64(salt), hash: b64(hash) }, "verifier");
      t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => { db.close(); reject(t.error); };
    });
  }, code);
  await page.reload(); await expect(page.getByRole("heading", { name: "Encrypt this device" })).toBeVisible();
  await expect(page.getByText("Sensitive legacy pot")).toHaveCount(0);
  await page.getByLabel("Recovery code", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Encrypt local data" }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  expect((await storage(page)).data.accounts[0].balance).toBe(3000);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Encrypt local data" }).click();
  await expect(page.getByRole("heading", { name: "Pick your gamertag" })).toBeVisible();
  await page.getByLabel(/Gamertag/).fill("oldfriend"); await page.getByRole("button", { name: "Save gamertag" }).click();
  await expect(page.getByText("Sensitive legacy pot")).toBeVisible();
  await expect.poll(async () => (await storage(page)).data.app).toBe("drip-local-data");
  const raw = await storage(page); expect(JSON.stringify(raw)).not.toContain("Sensitive legacy pot"); expect(raw.hasKey).toBe(false); expect(raw.draft).toBeUndefined();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByText("Sensitive legacy pot")).toHaveCount(0);
  await unlock(page, code); await expect(page.getByText("Sensitive legacy pot")).toBeVisible();
  await expect(page.getByTestId("header-tag")).toContainText("oldfriend");
});

test("new accounts never persist usable keys and sign-out retains only encrypted records", async ({ page }) => {
  await page.goto("/"); const code = (await page.getByTestId("code").textContent())!;
  await page.getByLabel(/Gamertag/).fill("vaulttester"); await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start", exact: true }).click(); await expect(page.getByText("No accounts yet")).toBeVisible();
  expect((await storage(page)).hasKey).toBe(false);
  page.on("dialog", d => d.accept()); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  const raw = await storage(page); expect(raw.data.app).toBe("drip-local-data"); expect(raw.hasKey).toBe(false);
  expect(JSON.stringify(raw)).not.toContain("vaulttester");
  await page.reload(); await page.getByText("Forgot password? Recover with a code", { exact: true }).click(); await page.getByLabel("Recovery code", { exact: true }).fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("vaulttester");
});
