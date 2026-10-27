import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
import { createVault, encryptLocal } from "../lib/local-vault";
import { passwordProof, wrapPasswordRoot } from "../lib/password-crypto";
import { emptyData } from "../lib/db";

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_LOGIN_CAPTURE) return;
  const dir = "docs/screenshots/gamertag-signin";
  await mkdir(dir, { recursive: true });
  for (const [device, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/${state}-${device}.png`, fullPage: true,
      style: 'input[type="password"] { color: transparent !important; caret-color: transparent !important; }' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test("one gamertag form reopens encrypted accounts, rejects bad credentials and works offline after sign-out", async ({ page, context }) => {
  // Local synthetic network only. The real client, password crypto, encrypted
  // IndexedDB, sign-out gate and service worker run; no cloud account is created.
  const username = "demo_saver201", password = "Synthetic meadow 42!", owner = "synthetic-owner";
  const root = generateRecoveryCode(), keys = await createVault(root);
  const envelope = await wrapPasswordRoot(root, username, password, owner);
  const proof = await passwordProof(username, password);
  const data = { ...emptyData(), identity: { id: crypto.randomUUID(), handle: username, createdAt: "2026-10-26" }, accounts: [{
    id: crypto.randomUUID(), provider: "Zopa", balance: 1234, ratePct: 4, rateType: "interest" as const,
    frequency: "monthly" as const, nextPayoutDate: "2030-01-01", colour: "#2b2d86", payouts: [], createdAt: "2026-10-26",
  }] };
  const records = { data: await encryptLocal(data, keys), localVault: keys.header, verifier: await codeVerifier(root),
    passwordUnlock: { vaultId: keys.header.id, envelope } };
  await context.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/sign-in/gamertag")) {
      const body = request.postDataJSON();
      if (body.username !== username || body.proof !== proof) return route.fulfill({ status: 401, json: { message: "Gamertag or password is incorrect." } });
      return route.fulfill({ json: { owner, envelope } });
    }
    if (path === "/api/cloud/status") return route.fulfill({ json: { available: false } });
    return route.fulfill({ status: 503, json: { message: "Unexpected synthetic request." } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
  await capture(page, "login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await capture(page, "signup");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.evaluate(async values => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("Synthetic storage unavailable")); });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("kv", "readwrite"), store = t.objectStore("kv");
      for (const [key, value] of Object.entries(values)) store.put(value, key);
      t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => { db.close(); reject(new Error("Synthetic storage write failed")); };
    });
  }, records);
  await page.reload();
  const login = page.getByRole("form", { name: "Password sign-in", exact: true });
  await expect(login.getByLabel("Gamertag", { exact: true })).toHaveValue(username);
  await expect(page.getByRole("button", { name: "Use another account" })).toHaveCount(0);
  await expect(page.getByLabel("Recovery code", { exact: true })).toHaveCount(0);
  await capture(page, "saved-gamertag");
  await login.getByLabel("Gamertag", { exact: true }).fill("demo_saver");
  await login.getByLabel("Password", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(login.getByRole("alert")).toContainText("Gamertag or password is incorrect.");
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  await login.getByLabel("Gamertag", { exact: true }).fill(username.toUpperCase());
  await login.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText(username);
  await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£1,234.00");
  await capture(page, "accounts");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recover your account" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Password sign-in", exact: true })).toHaveCount(0);
  await capture(page, "recovery");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await context.setOffline(true); await page.reload();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: /Zopa/ })).toContainText("£1,234.00");
});

test("old account-switch bookmarks use the same sign-in page", async ({ page }) => {
  await page.goto("/#other");
  await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Password sign-in", exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: "Other account password sign-in", exact: true })).toHaveCount(0);
  await page.goto("/#other-recover");
  await expect(page.getByRole("heading", { name: "Recover your account" })).toBeVisible();
});
