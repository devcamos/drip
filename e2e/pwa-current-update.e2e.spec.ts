import { test, expect, type Page } from "@playwright/test";
import { createServer, request } from "node:http";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import { calendarAccount } from "../tests/payment-calendar-fixtures";

test.use({ baseURL: "http://127.0.0.1:4338" });

async function encryptedRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<string>(resolve => {
      const tx = db.transaction("kv"), store = tx.objectStore("kv"), data = store.get("data"), vault = store.get("localVault");
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify({ data: data.result, vault: vault.result })); };
    });
  });
}

test("the current installed shell accepts a new public fingerprint and preserves offline accounts and another open tab", async ({ page, context }) => {
  // Real current app/worker and actual browser caches. Only a subsequent public
  // build fingerprint is injected by this loopback proxy. This does not claim
  // to exercise an older compiled client or a physical Home Screen app.
  const original = await (await page.request.get("http://localhost:4321/sw-build.js")).text();
  let fingerprint = original;
  const proxy = createServer((incoming, outgoing) => {
    if (incoming.url === "/sw-build.js") {
      outgoing.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      outgoing.end(fingerprint); return;
    }
    const upstream = request({ hostname: "127.0.0.1", port: 4321, path: incoming.url, method: incoming.method, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
    });
    upstream.on("error", () => { outgoing.writeHead(502); outgoing.end(); }); incoming.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4338, "127.0.0.1", resolve));
  try {
    const code = await legacyAccount(page, "pwa_regression", [calendarAccount({ balance: 1234.56 })]);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const before = await encryptedRecords(page);
    expect(before).not.toContain('"balance"');
    const other = await context.newPage(); await other.goto("/"); await unlock(other, code);
    await other.evaluate(() => { document.documentElement.dataset.retainedRegressionTab = "yes"; });
    fingerprint = original.replace(/("[^"\n]*")/, value => JSON.stringify(JSON.parse(value) + "-next-regression"));
    expect(fingerprint).not.toBe(original);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Reload update" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "Account cards", exact: true })).toContainText("£1,234.56");
    expect(await encryptedRecords(page)).toBe(before);
    await page.getByRole("button", { name: "Reload update" }).click(); await unlock(page, code);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain("drip-shell-" + JSON.parse(fingerprint.match(/"[^"]+"/)![0]));
    expect(await other.evaluate(() => document.documentElement.dataset.retainedRegressionTab)).toBe("yes");
    await context.setOffline(true); await page.reload(); await unlock(page, code);
    await expect(page.getByRole("region", { name: "Account cards", exact: true })).toContainText("£1,234.56");
    expect(await encryptedRecords(page)).toBe(before);
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(entry => new URL(entry.url).pathname)))).flat());
    expect(cached.some(path => path.startsWith("/api/"))).toBe(false);
  } finally {
    await context.setOffline(false);
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
