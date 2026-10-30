import { expect, test } from "@playwright/test";
import { createServer, request } from "node:http";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
import { createVault, encryptLocal } from "../lib/local-vault";
import { wrapPasswordRoot } from "../lib/password-crypto";
import { emptyData } from "../lib/db";

test.use({ baseURL: "http://127.0.0.1:4347" });
test("a saved password and encrypted records survive an old-to-new build update while signed out", async ({ page, context }) => {
  test.skip(!process.env.DRIP_SIGNIN_UPDATE, "Requires previous optimized build on4346 and candidate on4345, both without cloud configuration.");
  test.setTimeout(90_000);
  let upstreamPort = 4346;
  const proxy = createServer((req, res) => {
    const upstream = request({ hostname: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("Local build unavailable"); }); req.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4347, "127.0.0.1", resolve));
  try {
    // Real encrypted local fixture. No mocked cloud identity and no cloud writes.
    const username = "update_saver201", password = "Synthetic update meadow 42!";
    const root = generateRecoveryCode(), keys = await createVault(root);
    const data = { ...emptyData(), identity: { id: crypto.randomUUID(), handle: username, createdAt: "2026-10-26" }, accounts: [{
      id: crypto.randomUUID(), provider: "Zopa", balance: 1234, ratePct: 4, rateType: "interest" as const,
      frequency: "monthly" as const, nextPayoutDate: "2030-01-01", colour: "#2b2d86", payouts: [], createdAt: "2026-10-26",
    }] };
    const values = { data: await encryptLocal(data, keys), localVault: keys.header, verifier: await codeVerifier(root),
      passwordUnlock: { vaultId: keys.header.id, envelope: await wrapPasswordRoot(root, username, password, "synthetic-update-owner") } };
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect((await (await page.request.get("/api/cloud/status")).json()).available).toBe(false);
    const oldBuild = await (await page.request.get("/sw-build.js")).text();
    await page.evaluate(async values => {
      const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction("kv", "readwrite"), store = t.objectStore("kv");
        for (const [key, value] of Object.entries(values)) store.put(value, key);
        t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => { db.close(); reject(new Error("Synthetic storage failed")); };
      });
    }, values);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£1,234.00");
    await context.setOffline(false);
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    const before = await savedRecords(page);
    upstreamPort = 4345;
    expect((await (await page.request.get("/api/cloud/status")).json()).available).toBe(false);
    const buildResponse = await page.request.get("/sw-build.js");
    const newBuild = await buildResponse.text();
    expect(newBuild).not.toBe(oldBuild);
    expect(buildResponse.headers()["cache-control"]).toContain("no-store");
    // Old signed-out clients have no updater. An ordinary online reopen loads
    // the new login UI, which can then offer the waiting worker safely.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload update" })).toBeVisible({ timeout: 30_000 });
    expect(await savedRecords(page)).toBe(before);
    await page.getByRole("button", { name: "Reload update" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain("drip-shell-" + JSON.parse(newBuild.match(/"[^"]+"/)![0]));
    expect(await savedRecords(page)).toBe(before);
    await context.setOffline(true); await page.reload();
    await expect(page.getByLabel("Gamertag", { exact: true })).toHaveValue(username);
    await page.getByLabel("Password", { exact: true }).fill("Wrong synthetic password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("form", { name: "Password sign-in", exact: true }).getByRole("alert")).toContainText("Gamertag or password is incorrect.");
    expect(await savedRecords(page)).toBe(before);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£1,234.00");
    expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name =>
      (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat().some(path => path.startsWith("/api/")))).toBe(false);
  } finally {
    await context.setOffline(false);
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});

async function savedRecords(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<string>(resolve => {
      const t = db.transaction("kv"), store = t.objectStore("kv");
      const records = ["data", "localVault", "verifier", "passwordUnlock", "cloudState"].map(key => store.get(key));
      t.oncomplete = () => { db.close(); resolve(JSON.stringify(records.map(r => r.result))); };
    });
  });
}
