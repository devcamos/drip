import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { withAuthRetry, finishSignupRecovery } from "./auth-helpers";

const password = "Synthetic meadow 42!";
const tag = () => "dv_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
async function signup(page: Page, name: string) {
  await page.goto("http://localhost:4321/#signup");
  await page.getByLabel(/Gamertag/).fill(name);
  await page.getByLabel("Create password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new account password", { exact: true }).fill(password);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Create account", exact: true }).click(), page.getByRole("heading", { name: "Save your recovery codes" }));
  await finishSignupRecovery(page);
}
async function login(page: Page, name: string, success: Locator) {
  const form = page.getByRole("form", { name: "Password sign-in", exact: true });
  await form.getByLabel("Gamertag").fill(name);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await withAuthRetry(page, () => form.getByRole("button", { name: "Sign in", exact: true }).click(), success);
}
async function capture(page: Page, name: string) {
  if (!process.env.DRIP_SIGNIN_CAPTURE) return;
  await mkdir("docs/screenshots/four-device-signin", { recursive: true });
  // Clear the visible secret input without changing the verified switch state.
  await page.getByLabel("Password", { exact: true }).fill("");
  for (const [device, width] of [["mobile", 390], ["desktop", 1280]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `docs/screenshots/four-device-signin/${name}-${device}.png`, scale: "css" });
  }
}
async function savedRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<string>(resolve => { const t = db.transaction("kv"); const r = t.objectStore("kv").getAll(); t.oncomplete = () => { db.close(); resolve(JSON.stringify(r.result)); }; });
  });
}
async function synced(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<boolean>(resolve => { const t = db.transaction("kv"); const r = t.objectStore("kv").get("cloudState"); t.oncomplete = () => { db.close(); resolve(r.result?.dirty === false && r.result.version > 1); }; });
  }), { timeout: 30_000 }).toBe(true);
}

test("four browsers restore the same account; a fifth is blocked; account switching preserves local data until consent", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview test database.");
  test.setTimeout(240_000);
  const name = tag(), otherName = tag();
  const second = await browser.newContext(), third = await browser.newContext(), fourth = await browser.newContext(), fifth = await browser.newContext(), target = await browser.newContext();
  try {
    await signup(page, name);
    await page.getByRole("button", { name: "Add account", exact: true }).click();
    await page.getByLabel("Balance", { exact: true }).fill("3000"); await page.getByLabel("Rate", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Save", exact: true }).click(); await synced(page);
    const b = await second.newPage(); await b.goto("http://localhost:4321/");
    await login(b, name, b.getByTestId("header-tag"));
    await expect(b.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,000.00");
    for (const context of [third, fourth]) {
      const extra = await context.newPage(); await extra.goto("http://localhost:4321/");
      await login(extra, name, extra.getByTestId("header-tag"));
      await expect(extra.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,000.00");
    }
    const c = await fifth.newPage(); await c.goto("http://localhost:4321/");
    const limit = c.getByRole("alert").filter({ hasText: "4 devices are already signed in" });
    await login(c, name, limit);
    await expect(limit).toBeVisible();
    expect(await (await c.request.get("http://localhost:4321/api/auth/get-session")).json()).toBeNull();
    await capture(c, "device-limit");
    // Reopening browser B renews its existing slot, while A stays authenticated.
    await b.reload(); await login(b, name, b.getByTestId("header-tag"));
    expect(await (await page.request.get("http://localhost:4321/api/auth/get-session")).json()).not.toBeNull();
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
    await login(c, name, c.getByTestId("header-tag"));
    await expect(c.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,000.00");

    const d = await target.newPage(); await signup(d, otherName);
    const before = await savedRecords(page);
    await login(page, otherName, page.getByRole("region", { name: "Switch saved account" }));
    expect(await (await page.request.get("http://localhost:4321/api/auth/get-session")).json()).toBeNull();
    expect(await savedRecords(page)).toBe(before);
    await capture(page, "switch-account");
    await page.getByRole("button", { name: "Cancel account switch" }).click();
    expect(await savedRecords(page)).toBe(before);
    await login(page, otherName, page.getByRole("region", { name: "Switch saved account" }));
    await withAuthRetry(page, () => page.getByRole("button", { name: "Switch account on this browser" }).click(), page.getByTestId("header-tag"));
    await expect(page.getByTestId("header-tag")).toContainText(otherName);
    await expect(c.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,000.00");

    // An offline top-up cannot be replaced by another account's cloud copy.
    await second.setOffline(true);
    await b.getByRole("button", { name: /Zopa/ }).click();
    await b.getByRole("button", { name: "Top up", exact: true }).click();
    await b.getByLabel("amount", { exact: true }).fill("200");
    await b.getByRole("button", { name: "Save", exact: true }).click();
    await expect(b.locator(".bal")).toHaveText("£3,200.00");
    b.on("dialog", dialog => dialog.accept()); await b.getByRole("button", { name: "Sign out", exact: true }).click();
    await second.setOffline(false);
    await expect(b.getByText(/Cloud session sign-out is not yet confirmed/)).toHaveCount(0, { timeout: 30_000 });
    // The status text can disappear before the accepted revocation is persisted.
    // Snapshot only after that legitimate metadata write has finished.
    await expect.poll(() => b.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
      return new Promise<boolean | undefined>(resolve => { const t = db.transaction("kv"); const r = t.objectStore("kv").get("deviceSession"); t.oncomplete = () => { db.close(); resolve(r.result?.remotePending); }; });
    }), { timeout: 30_000 }).toBe(false);
    const dirty = await savedRecords(b);
    await login(b, otherName, b.getByRole("region", { name: "Switch saved account" }));
    await expect(b.getByText(/aren.t synced/)).toBeVisible();
    await expect(b.getByRole("button", { name: "Switch account on this browser" })).toHaveCount(0);
    expect(await savedRecords(b)).toBe(dirty);
    await capture(b, "unsynced-account");
    await login(b, name, b.getByTestId("header-tag"));
    await expect(b.getByRole("region", { name: "Account cards", exact: true })).toContainText("£3,200.00");
  } finally { await second.close(); await third.close(); await fourth.close(); await fifth.close(); await target.close(); }
});
