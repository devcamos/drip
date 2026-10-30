import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
import { createVault, encryptLocal } from "../lib/local-vault";
import { passwordProof, wrapPasswordRoot } from "../lib/password-crypto";
import { emptyData } from "../lib/db";

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_DEVICE_CAPTURE) return;
  await mkdir(process.env.DRIP_DEVICE_CAPTURE, { recursive: true });
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) {
      const options = { path: `${process.env.DRIP_DEVICE_CAPTURE}/${state}-${width}.png`, style: 'input[type="password"] { color:transparent !important; caret-color:transparent !important; }' };
      if (state === "settings-devices") await page.getByRole("region", { name: "Signed-in devices", exact: true }).screenshot({ ...options, scale: "css" });
      else await page.screenshot({ ...options, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
}
test("manages the cap from sign-in, preserves encrypted accounts and exposes management in Settings", async ({ page, context }) => {
  // Synthetic API state exercises the real rendered UI, crypto, local vault and
  // signed-out request gate. Real Better Auth+SQL behavior is tested separately
  // in integration/device-management.test.ts; this does not prove hosted login.
  const username = "demo_saver29", password = "Synthetic meadow 42!", owner = "synthetic-owner";
  const root = generateRecoveryCode(), keys = await createVault(root), envelope = await wrapPasswordRoot(root, username, password, owner);
  const proof = await passwordProof(username, password);
  const data = { ...emptyData(), identity: { id: crypto.randomUUID(), handle: username, createdAt: "2026-10-29" }, accounts: [{ id: crypto.randomUUID(), provider: "Zopa", balance: 1234.56, ratePct: 4, rateType: "interest" as const, frequency: "monthly" as const, nextPayoutDate: "2030-01-01", colour: "#2b2d86", payouts: [], createdAt: "2026-10-29" }] };
  const records = { data: await encryptLocal(data, keys), localVault: keys.header, verifier: await codeVerifier(root), passwordUnlock: { vaultId: keys.header.id, envelope }, deviceSession: { signedOut: true, remotePending: false, generation: "synthetic-signout" } };
  let devices = [{ id: "synthetic-a", name: "Safari on iPhone", signedInAt: "2026-10-29T09:15:00Z", current: false }, { id: "synthetic-b", name: "Chrome on Windows", signedInAt: "2026-10-28T18:30:00Z", current: false }];
  let revocations = 0;
  await context.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/sign-in/gamertag")) {
      const body = req.postDataJSON();
      if (body.username !== username || body.proof !== proof) return route.fulfill({ status: 401, json: { message: "Gamertag or password is incorrect." } });
      if (path.endsWith("gamertag-devices")) return route.fulfill({ json: { devices } });
      if (path.endsWith("gamertag-revoke-device")) { devices = devices.filter(device => device.id !== body.sessionId); revocations++; return route.fulfill({ json: { removed: true, current: false } }); }
      if (path.endsWith("gamertag") && devices.length >= 2) return route.fulfill({ status: 409, json: { code: "DEVICE_LIMIT_REACHED", message: "Two devices are already signed in. Sign out on one, then try again." } });
      return route.fulfill({ json: { owner, envelope } });
    }
    if (path === "/api/cloud/status" || path === "/api/notifications/config") return route.fulfill({ json: { available: false } });
    if (path === "/api/auth/get-session") return route.fulfill({ json: null });
    return route.fulfill({ status: 503, json: { message: "Unexpected synthetic request." } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Drip", exact: true })).toBeVisible();
  await page.evaluate(async values => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const t = db.transaction("kv", "readwrite"); for (const [key, value] of Object.entries(values)) t.objectStore("kv").put(value, key); t.oncomplete = () => { db.close(); resolve(); }; });
  }, records);
  await page.reload();
  await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Password sign-in", exact: true }).getByRole("alert")).toContainText("Two devices"); await capture(page, "device-limit");
  await page.getByRole("button", { name: "Manage devices", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your signed-in devices" })).toBeVisible(); await expect(page.getByText("2 of 2 sign-ins in use")).toBeVisible(); await capture(page, "devices");
  await page.getByRole("button", { name: "Sign out Safari on iPhone" }).click();
  await expect(page.getByRole("region", { name: "Confirm device sign-out" })).toBeVisible(); await capture(page, "confirm-sign-out");
  await page.getByRole("button", { name: "Keep device" }).click(); expect(revocations).toBe(0);
  await page.getByRole("button", { name: "Sign out Safari on iPhone" }).click(); await page.getByRole("button", { name: "Confirm sign out" }).click();
  await expect(page.getByRole("region", { name: "Manage signed-in devices", exact: true }).getByRole("status")).toContainText("Device signed out"); expect(revocations).toBe(1);
  await page.getByRole("button", { name: "Sign in on this device" }).click();
  await expect(page.getByRole("region", { name: "Account cards", exact: true })).toContainText("£1,234.56");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Signed-in devices", exact: true })).toBeVisible(); await capture(page, "settings-devices");
  await page.getByLabel("Confirm password to manage devices").fill(password); await page.getByRole("button", { name: "Manage devices", exact: true }).click();
  await expect(page.getByText("1 of 2 sign-ins in use")).toBeVisible();
  await page.getByRole("button", { name: "Close devices" }).click(); await expect(page.getByLabel("Confirm password to manage devices")).toHaveValue("");
});
