import { test, expect } from "@playwright/test";
import { createServer, request as proxyRequest, type Server } from "node:http";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import { releaseSaver, releaseStock } from "../tests/saved-experience-fixtures";

// Two independently compiled, actual releases behind one stable bookmark.
// No worker bytes, fingerprints, HTML or IndexedDB version are spoofed.
// Start old main on4331 and the candidate on4321; this proxy switches4322.
test.use({ baseURL: "http://127.0.0.1:4322" });
test("saved bookmark updates from the old worker, refreshes imported build identity, and retains encrypted accounts offline", async ({ page, context }) => {
  test.skip(!process.env.DRIP_PWA_UPGRADE, "Requires a coordinated previous/current build transition.");
  test.setTimeout(120_000);
  const oldPort = Number(process.env.DRIP_PWA_OLD_PORT ?? 4331), newPort = Number(process.env.DRIP_PWA_NEW_PORT ?? 4321);
  let port = oldPort;
  const proxy: Server = createServer((req, res) => {
    const upstream = proxyRequest({ hostname: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("No compiled test upstream"); }); req.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4322, "127.0.0.1", resolve));
  try {
    const oldResponse = await page.request.get("/sw-build.js");
    expect(oldResponse.headers()["cache-control"]).toMatch(/no-store|no-cache|max-age=0/);
    const oldIdentity = await oldResponse.text();
    const oldBuild = /self\.DRIP_BUILD_ID = "([^"\n]+)"/.exec(oldIdentity)?.[1];
    expect(oldBuild).toBeTruthy(); const oldCache = `drip-shell-${oldBuild}`;
    const code = await legacyAccount(page, "update_demo", [releaseSaver(), releaseStock()]);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain(oldCache);
    expect(await page.evaluate(async () => new Promise<number>((resolve, reject) => {
      const q = indexedDB.open("drip"); q.onsuccess = () => { resolve(q.result.version); q.result.close(); }; q.onerror = () => reject(q.error);
    }))).toBe(2);
    const oldAsset = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      return (await cache.keys()).map(request => new URL(request.url).pathname).find(path => path.startsWith("/_next/static/"));
    }, oldCache); expect(oldAsset).toBeTruthy();
    const other = await context.newPage(); await other.goto("/"); await unlock(other, code);
    await expect(other.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Zopa/ })).toContainText("£5,000.00");
    await other.evaluate(() => { document.documentElement.dataset.updateFixture = "old-tab-kept"; });
    port = newPort;
    const newResponse = await page.request.get("/sw-build.js");
    expect(newResponse.headers()["cache-control"]).toMatch(/no-store|no-cache|max-age=0/);
    const newIdentity = await newResponse.text();
    const newBuild = /self\.DRIP_BUILD_ID = "([^"\n]+)"/.exec(newIdentity)?.[1];
    expect(newBuild).toBeTruthy(); expect(newBuild).not.toBe(oldBuild);
    await test.info().attach("actual-release-identities", { contentType: "application/json", body: JSON.stringify({ oldBuild, newBuild, oldCacheControl: oldResponse.headers()["cache-control"], newCacheControl: newResponse.headers()["cache-control"], oldPort, newPort }) });
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole("button", { name: "Reload update", exact: true })).toBeVisible({ timeout: 30_000 });
    // Detection leaves the old release and its saved account view open.
    expect(await other.evaluate(() => document.documentElement.dataset.updateFixture)).toBe("old-tab-kept");
    await page.getByRole("button", { name: "Reload update", exact: true }).click(); await unlock(page, code);
    const cards = page.getByRole("region", { name: "Account cards", exact: true });
    await expect(cards.getByRole("button", { name: /Open Zopa/ })).toContainText("£5,000.00");
    await expect(cards.getByRole("button", { name: /Open Realty Income/ })).toContainText("£2,500.00");
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain(`drip-shell-${newBuild}`);
    expect(await page.evaluate(async () => new Promise<number>((resolve, reject) => {
      const q = indexedDB.open("drip"); q.onsuccess = () => { resolve(q.result.version); q.result.close(); }; q.onerror = () => reject(q.error);
    }))).toBe(3);
    await page.getByRole("button", { name: "Add an account", exact: true }).click();
    await page.getByRole("button", { name: /Credit card/ }).click();
    await page.getByLabel("Credit card provider", { exact: true }).selectOption("Lloyds");
    for (const [label, value] of [["Amount owed (£)", "600"], ["APR (%)", "19.9"], ["Statement minimum payment (£)", "20"], ["Planned payment (£, optional)", "50"], ["Payment due date", "2027-01-25"]]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Add credit card", exact: true }).click();
    await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£50.00");
    await page.getByRole("button", { name: "← Accounts", exact: true }).click();
    await expect(cards.getByRole("button", { name: /Open Lloyds/ })).toContainText("£600.00");
    expect(await other.evaluate(() => document.documentElement.dataset.updateFixture)).toBe("old-tab-kept");
    await context.setOffline(true);
    expect(await other.evaluate(async path => (await fetch(path!)).ok, oldAsset)).toBe(true);
    await page.reload(); await unlock(page, code);
    await expect(cards.getByRole("button", { name: /^Open / })).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£6,900.00");
    await cards.getByRole("button", { name: /Open Lloyds/ }).click();
    await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£50.00");
    expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat().some(path => path.startsWith("/api/")))).toBe(false);
  } finally {
    await context.setOffline(false); await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
