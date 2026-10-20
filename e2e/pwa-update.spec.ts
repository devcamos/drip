import { test, expect } from "@playwright/test";
import { createServer, request as proxyRequest, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";

// Opt-in deployment-transition check. Start on the previous optimized build,
// wait for its seed marker, rebuild/restart localhost4321, then write ready.
// A local proxy keeps the bookmark origin stable during that deployment switch.
test.use({ baseURL: "http://127.0.0.1:4322" });
test("saved bookmark updates from the old worker, refreshes imported build identity, and retains encrypted accounts offline", async ({ page, context }) => {
  test.skip(!process.env.DRIP_PWA_UPGRADE, "Requires a coordinated previous/current build transition.");
  test.setTimeout(240_000);
  let release: "old" | "current" | "next-import" = "old";
  let nextIdentity = "";
  const oldWorker = execFileSync("git", ["show", "45a01d2:public/sw.js"], { encoding: "utf8" });
  const proxy: Server = createServer((req, res) => {
    if (req.url === "/sw.js" && release === "old") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" }); res.end(oldWorker); return;
    }
    if (req.url === "/sw-build.js" && release === "next-import") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" }); res.end(nextIdentity); return;
    }
    const upstream = proxyRequest({ hostname: "127.0.0.1", port: 4321, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("Upstream restarting"); }); req.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4322, "127.0.0.1", resolve));
  try {
    const code = await legacyAccount(page, "update_demo");
    await page.getByRole("button", { name: "Add account", exact: true }).click();
    await page.getByLabel("Provider", { exact: true }).selectOption("Zopa");
    await page.getByLabel("Balance", { exact: true }).fill("3000");
    await page.getByLabel("Rate", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".bal")).toHaveText("£3,000.00");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain("drip-shell-v15");
    const oldAsset = await page.evaluate(async () => {
      const cache = await caches.open("drip-shell-v15");
      return (await cache.keys()).map(r => new URL(r.url).pathname).find(path => path.startsWith("/_next/static/"))!;
    });
    const other = await context.newPage(); await other.goto("/"); await unlock(other, code);
    await expect(other.getByRole("button", { name: /Zopa/ })).toContainText("£3,000.00");
    await other.evaluate(() => { document.documentElement.dataset.updateFixture = "old-tab-kept"; });
    await writeFile("/tmp/drip-pwa-old-seeded", "ready\n");
    await expect.poll(async () => { try { return (await readFile("/tmp/drip-pwa-new-ready", "utf8")).trim(); } catch { return "waiting"; } }, { timeout: 150_000, intervals: [1000] }).toBe("ready");
    release = "current";
    const currentWorker = await (await page.request.get("/sw.js")).text();
    const currentIdentity = await (await page.request.get("/sw-build.js")).text();
    expect(currentIdentity).toMatch(/^self\.DRIP_BUILD_ID = "/);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole("button", { name: "Reload update" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".bal")).toHaveText("£3,000.00"); // Detection does not reload an open editor.
    await mkdir("docs/screenshots/bookmark-updates", { recursive: true });
    for (const [device, width] of [["mobile", 390], ["desktop", 1280]] as const) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `docs/screenshots/bookmark-updates/update-ready-${device}.png`, fullPage: true, scale: "css" });
    }
    await page.getByRole("button", { name: "Reload update" }).click();
    await unlock(page, code);
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£3,000.00");
    expect(await other.evaluate(() => document.documentElement.dataset.updateFixture)).toBe("old-tab-kept");
    await context.setOffline(true);
    expect(await other.evaluate(async path => (await fetch(path)).ok, oldAsset)).toBe(true);
    await page.reload(); await unlock(page, code);
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£3,000.00");
    await context.setOffline(false);
    // Simulate the next release changing only its imported public fingerprint.
    // The actual main worker bytes stay identical throughout this second update.
    nextIdentity = currentIdentity.replace(/("[^"\n]*")/, value => JSON.stringify(JSON.parse(value) + "-next-fixture"));
    release = "next-import";
    expect(await (await page.request.get("/sw.js")).text()).toBe(currentWorker);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Reload update" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Reload update" }).click(); await unlock(page, code);
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£3,000.00");
    const keys = await page.evaluate(() => caches.keys());
    expect(keys.some(key => key.endsWith("-next-fixture"))).toBe(true);
    await context.setOffline(true); await page.reload(); await unlock(page, code);
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£3,000.00");
    expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat().some(path => path.startsWith("/api/")))).toBe(false);
  } finally {
    await context.setOffline(false);
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
