import { legacyAccount } from "./legacy-account-helpers";
import { unwrapPasswordRoot } from "../lib/password-crypto";
import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { showRecovery } from "./vault-helpers";
import { withAuthRetry } from "./auth-helpers";
const password = "Green meadow 42!";
const nextPassword = "Blue waterfall 73!";
const tag = () => "pw_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
async function onboard(page: Page, handle: string, withPassword = false) {
  if (!withPassword) return legacyAccount(page, handle);
  await page.goto("/#signup");
  await expect(page.getByTestId("code")).toHaveCount(0);
  await page.getByLabel(/Gamertag/).fill(handle);
  await page.getByLabel("Create password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new account password", { exact: true }).fill(password);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Create account", exact: true }).click(), page.getByTestId("header-tag"));
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true })).toHaveClass("on");
  return "";
}

async function setPassword(page: Page, handle: string, code: string, secret: string) {
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  const form = page.getByRole("region", { name: "Sign-in and password" });
  await form.getByLabel("Sign-in gamertag").fill(handle);
  await form.getByLabel("Recovery code to set or reset your password").fill(code);
  await form.getByLabel("New password", { exact: true }).fill(secret); await form.getByLabel("Confirm password", { exact: true }).fill(secret);
  await withAuthRetry(page, () => form.getByRole("button", { name: "Save password" }).click(), form.getByText(/Password saved. Sign in as/));
}
async function login(page: Page, handle: string, secret: string, wrong = false) {
  const form = page.getByRole("form", { name: "Password sign-in", exact: true });
  await form.getByLabel("Sign-in gamertag").fill(handle); await form.getByLabel("Password", { exact: true }).fill(secret);
  await withAuthRetry(page, () => form.getByRole("button", { name: "Sign in with password" }).click(), wrong ? page.getByText("Gamertag or password is incorrect.") : page.getByTestId("header-tag"));
}
test("existing encrypted accounts gain ordinary password sign-in, offline unlock, fresh-device access and recovery reset", async ({ page, context, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database."); test.setTimeout(120_000);
  const handle = tag(); const code = await onboard(page, handle);
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Balance", { exact: true }).fill("3000"); await page.getByLabel("Rate", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await setPassword(page, handle, code, password);
  page.on("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await login(page, handle, "Wrong password 42!", true); await expect(page.getByText("Gamertag or password is incorrect.")).toBeVisible();
  // The library's durable limiter must return usable seconds, not a bigint
  // timestamp concatenated with its window. Keep the real limit enabled.
  await login(page, handle, "Another wrong password 43!", true);
  await login(page, handle, "Another wrong password 44!", true);
  const limited = await page.request.post("/api/auth/sign-in/gamertag", { headers: { origin: "http://localhost:4321" }, data: { username: handle, proof: "A".repeat(43) } });
  expect(limited.status()).toBe(429);
  const retryAfter = Number(limited.headers()["retry-after"] ?? limited.headers()["x-retry-after"]);
  expect(retryAfter).toBeGreaterThan(0); expect(retryAfter).toBeLessThanOrEqual(60);
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  await login(page, handle.toUpperCase(), password); await expect(page.getByText("£3,000.00").first()).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload(); await login(page, handle, password);
  await expect(page.getByText("£3,000.00").first()).toBeVisible(); await context.setOffline(false);
  const second = await browser.newContext(); const other = await second.newPage();
  try {
    await other.goto("http://localhost:4321/"); await login(other, handle, password);
    await expect(other.getByText("£3,000.00").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await showRecovery(page);
    await page.getByLabel("Recovery code", { exact: true }).fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByTestId("header-tag")).toBeVisible(); await setPassword(page, handle, code, nextPassword);
    await expect.poll(async () => (await other.request.get("http://localhost:4321/api/auth/get-session")).json()).toBeNull();
    await other.reload(); await login(other, handle, password, true); await expect(other.getByText("Gamertag or password is incorrect.")).toBeVisible();
    await login(other, handle, nextPassword); await expect(other.getByText("£3,000.00").first()).toBeVisible();
  } finally { await second.close(); }
});
test("signup opens Accounts without recovery and offers code setup later with password confirmation", async ({ page }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database."); test.setTimeout(90_000);
  const payloads: string[] = [];
  page.on("request", request => { if (["/api/auth/sign-in/gamertag", "/api/auth/gamertag-password"].some(path => request.url().endsWith(path))) payloads.push(request.postData() ?? ""); });
  const handle = tag(); await onboard(page, handle, true);
  const setup = payloads.map(body => JSON.parse(body)).find(body => body.envelope);
  const code = await unwrapPasswordRoot(setup.envelope, handle, password);
  if (process.env.DRIP_UI_CAPTURE) {
    await mkdir("docs/screenshots/signup-to-accounts", { recursive: true });
    await expect(page.getByText("Cloud copy is up to date.")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/signup-to-accounts/accounts-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "docs/screenshots/signup-to-accounts/accounts-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  // Recovery setup is optional after signup, and starts with password confirmation.
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  const codes = page.getByRole("region", { name: "Recovery codes" });
  await expect(codes.getByLabel("Confirm your password", { exact: true })).toBeVisible();
  if (process.env.DRIP_UI_CAPTURE) await codes.screenshot({ path: "docs/screenshots/signup-to-accounts/code-setup-mobile.png" });
  await codes.getByLabel("Confirm your password", { exact: true }).fill(password);
  page.on("dialog", dialog => dialog.accept());
  await codes.getByRole("button", { name: "Create six recovery codes" }).click();
  await expect(codes.getByRole("listitem")).toHaveCount(6, { timeout: 30_000 });
  await expect(codes.getByRole("button", { name: "Download recovery codes" })).toBeEnabled();
  await page.reload(); await login(page, handle, password); await expect(page.getByTestId("header-tag")).toContainText(handle);
  expect(payloads.length).toBeGreaterThan(0); expect(payloads.some(body => body.includes(password) || body.includes(code))).toBe(false);
  const leak = await page.evaluate(async ({ root, secret }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<boolean>(resolve => { const tx = db.transaction("kv"); const records = tx.objectStore("kv").getAll(); tx.oncomplete = () => { db.close(); const json = JSON.stringify(records.result); resolve(json.includes(root) || json.includes(secret)); }; });
  }, { root: code, secret: password }); expect(leak).toBe(false);
  expect((await page.request.post("/api/auth/sign-in/gamertag", { headers: { origin: "https://untrusted.example" }, data: {} })).status()).toBe(403);
});
test("another account cannot claim an existing login gamertag", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database."); test.setTimeout(90_000);
  const handle = tag(); const code = await onboard(page, handle); await setPassword(page, handle, code, password);
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage(); const otherCode = await onboard(other, tag());
    await other.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
    const form = other.getByRole("region", { name: "Sign-in and password" });
    await form.getByLabel("Sign-in gamertag").fill(handle); await form.getByLabel(/Recovery code to set/).fill(otherCode);
    await form.getByLabel("New password", { exact: true }).fill(nextPassword); await form.getByLabel("Confirm password", { exact: true }).fill(nextPassword);
    await form.getByRole("button", { name: "Save password" }).click();
    await expect(form.getByText(/already used for sign-in/)).toBeVisible({ timeout: 30_000 });
    await page.reload(); await login(page, handle, password); await expect(page.getByTestId("header-tag")).toContainText(handle);
  } finally { await fresh.close(); }
});
