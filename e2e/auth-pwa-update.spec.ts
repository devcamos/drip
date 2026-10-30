import { test, expect } from "@playwright/test";
import { createServer, request } from "node:http";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";

test.use({ baseURL: "http://127.0.0.1:4347" });
test("signed-out accounts can accept a real build update and reopen their encrypted records offline", async ({ page, context }) => {
  test.skip(!process.env.DRIP_AUTH_PWA_UPGRADE, "Requires previous build on4346 and current build on4345.");
  test.setTimeout(120_000);
  let port = 4346;
  const proxy = createServer((req, res) => {
    const upstream = request({ hostname: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("Test upstream unavailable"); }); req.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4347, "127.0.0.1", resolve));
  try {
    const code = await legacyAccount(page, "update_signin");
    await page.getByRole("button", { name: "Add account", exact: true }).click();
    await page.getByLabel("Balance", { exact: true }).fill("3000"); await page.getByLabel("Rate", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".bal")).toHaveText("£3,000.00");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const oldIdentity = await (await page.request.get("/sw-build.js")).text();
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    const saved = await vaultRecords(page);
    port = 4345;
    const newIdentity = await (await page.request.get("/sw-build.js")).text();
    expect(newIdentity).not.toBe(oldIdentity);
    // The old UI has no signed-out update checks. A normal online reopening
    // loads the corrected UI; only then can it offer the waiting worker.
    await page.reload();
    await expect(page.getByRole("button", { name: "Reload update" })).toBeVisible({ timeout: 30000 });
    expect(await vaultRecords(page)).toBe(saved);
    const screenshots = "docs/screenshots/auth-app-update";
    await mkdir(screenshots, { recursive: true });
    for (const [label, width] of [["mobile", 390], ["desktop", 1280]] as const) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${screenshots}/signed-out-update-${label}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Reload update" }).click();
    await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain("drip-shell-" + JSON.parse(newIdentity.match(/"[^"]+"/)![0]));
    expect(await vaultRecords(page)).toBe(saved);
    await context.setOffline(true); await page.reload();
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByLabel("Recovery code", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,000.00");
    expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat().some(path => path.startsWith("/api/")))).toBe(false);
  } finally {
    await context.setOffline(false);
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});

async function vaultRecords(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("drip"); request.onsuccess = () => resolve(request.result); });
    return new Promise<string>(resolve => {
      const tx = db.transaction("kv"), store = tx.objectStore("kv");
      const records = ["data", "localVault", "verifier", "passwordUnlock", "cloudState"].map(key => store.get(key));
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(records.map(request => request.result))); };
    });
  });
}
