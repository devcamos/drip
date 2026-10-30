import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "off" }); // Recovery material must not be saved in traces.

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_ORIGINAL_CAPTURE) return;
  const dir = "docs/screenshots/signup-recovery-save"; await mkdir(dir, { recursive: true });
  for (const [device, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/${state}-${device}.png`, fullPage: true, scale: "css",
      mask: [page.locator('.recovery-list code'), page.locator('input[type="password"]')], maskColor: "#d9c8ae" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

for (const method of ["download", "screenshot", "retry", "offline-return", "initial-offline-return"] as const) {
test(`signup saves original codes by ${method} without another password and resumes the same set`, async ({ page }) => {
  // Real app, encryption, IndexedDB, password unwrap and file downloads. Only
  // the network backend is synthetic; this is not a hosted database/auth test.
  const owner = "synthetic-original-owner"; const password = "Synthetic river meadow 42!";
  let user: any; let passwordEnvelope: any; let vault: any = { version: 0, envelope: null };
  let records: any[] | undefined;
  let cloudSignedIn = false;
  let offlineNetwork = false;
  let recoveryUnavailable = method === "retry";
  let passwordSignIns = 0; let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/**", async route => {
    if (offlineNetwork) return route.abort("internetdisconnected");
    const request = route.request(); const path = new URL(request.url()).pathname;
    const body = request.postDataJSON(); let value: any = {};
    if (path === "/api/cloud/status") value = { available: true };
    else if (path === "/api/auth/sign-in/email" && !user) return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    else if (path === "/api/auth/sign-up/email") { user = { id: owner, email: body.email, name: "original_demo" }; cloudSignedIn = true; value = { user, token: "synthetic" }; }
    else if (path === "/api/auth/get-session") value = cloudSignedIn ? { user, session: { id: "synthetic", userId: owner, expiresAt: "2099-01-01T00:00:00Z" } } : null;
    else if (path === "/api/auth/sign-in/email") { cloudSignedIn = true; value = { user, token: "synthetic" }; }
    else if (path === "/api/auth/sign-out") cloudSignedIn = false;
    else if (path === "/api/auth/gamertag-password") { passwordEnvelope = body.envelope; value = { saved: true }; }
    else if (path.startsWith("/api/auth/sign-in/gamertag")) { passwordSignIns++; if (path.endsWith("/gamertag")) cloudSignedIn = true; value = { owner, envelope: passwordEnvelope }; }
    else if (path === "/api/cloud") {
      if (request.method() === "PUT") vault = { version: vault.version + 1, envelope: body.envelope, updated_at: new Date().toISOString() };
      value = vault;
    } else if (path === "/api/recovery-codes") {
      if (!cloudSignedIn) return route.fulfill({ status: 401, json: { error: "Session expired" } });
      if (recoveryUnavailable) return route.fulfill({ status: 503, json: { error: "Synthetic recovery outage" } });
      if (request.method() === "GET") value = { locators: records?.map(record => record.locator) ?? null };
      else if (request.method() === "PUT") {
        if (records && !body.records.every((candidate: any) => records!.some(original => original.locator === candidate.locator))) return route.fulfill({ status: 409, json: { code: "RECOVERY_CODES_EXIST" } });
        records ??= body.records; value = { saved: true };
      }
    }
    await route.fulfill({ json: value });
  });
  await page.goto("/#signup");
  await page.getByLabel(/^Gamertag/).fill("original_demo");
  await page.getByLabel("Create password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new account password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  if (method === "retry") {
    await expect(page.locator("main .panel").getByRole("alert")).toContainText("Could not open your recovery codes");
    await capture(page, "recovery-retry");
    await expect(page.getByTestId("header-tag")).toHaveCount(0);
    recoveryUnavailable = false;
    await page.getByRole("button", { name: "Try again" }).click();
  }
  await expect(page.getByRole("button", { name: "Download recovery codes" })).toBeVisible();
  await expect(page.getByLabel("Confirm your password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to Accounts" })).toBeDisabled();
  const originalCodes = await page.locator("#signup-recovery-codes code").allTextContents();
  expect(originalCodes).toHaveLength(6);
  expect(new Set(originalCodes).size).toBe(6);
  expect(passwordSignIns).toBe(0);
  if (method === "offline-return" || method === "initial-offline-return") {
    if (method === "offline-return") {
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
      await expect.poll(() => cloudSignedIn).toBe(false);
    } else {
      // Legacy unfinished first signup has no local generation. Expire only the
      // synthetic server session; do not seed a generation through sign-out.
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      cloudSignedIn = false;
    }
    offlineNetwork = true;
    await page.context().setOffline(true);
    if (method === "initial-offline-return") await page.reload();
    const offline = page.getByRole("form", { name: "Password sign-in", exact: true });
    await offline.getByLabel("Gamertag").fill("original_demo");
    await offline.getByLabel("Password", { exact: true }).fill(password);
    await offline.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("main .panel").getByRole("alert")).toContainText("Could not open your recovery codes");
    expect(cloudSignedIn).toBe(false);
    await page.context().setOffline(false);
    offlineNetwork = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Download recovery codes" })).toBeVisible();
    expect(cloudSignedIn).toBe(true);
    expect(await page.locator("#signup-recovery-codes code").allTextContents()).toEqual(originalCodes);
    expect(passwordSignIns).toBe(0);
    await expect(page.getByLabel("Confirm your password", { exact: true })).toHaveCount(0);
  }
  if (method === "download") await capture(page, "save-original-codes");
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  async function openAndDownload(settings = false) {
    const panel = page.getByRole("region", { name: "Recovery codes", exact: true });
    if (settings) {
      await panel.getByLabel("Confirm your password", { exact: true }).fill(password);
      await panel.getByRole("button", { name: "Open original recovery codes" }).click();
    } else await expect(panel.getByLabel("Confirm your password", { exact: true })).toHaveCount(0);
    const downloadEvent = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download recovery codes" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("drip-recovery-codes.txt");
    return readFile((await download.path())!, "utf8");
  }
  const original = method === "download" ? await openAndDownload() : undefined;
  if (original) expect(original.split("\n").filter(line => /^\d\. /.test(line))).toHaveLength(6);
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  await page.reload();
  const login = page.getByRole("form", { name: "Password sign-in", exact: true });
  await login.getByLabel("Gamertag").fill("original_demo");
  await login.getByLabel("Password", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download recovery codes" })).toBeVisible();
  expect(await page.locator("#signup-recovery-codes code").allTextContents()).toEqual(originalCodes);
  expect(passwordSignIns).toBe(2);
  if (original) expect(await openAndDownload()).toBe(original);
  else expect(downloads).toBe(0);
  await page.getByRole("checkbox", { name: /I’ve saved a screenshot/ }).check();
  if (method === "download") await capture(page, "saved-copy-confirmed");
  await page.getByRole("button", { name: "Continue to Accounts" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByTestId("header-tag")).toContainText("original_demo");
  if (method === "download") await capture(page, "accounts-after-save");
  if (!original) expect(downloads).toBe(0);
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  const sameFile = await openAndDownload(true);
  if (original) expect(sameFile).toBe(original);
  originalCodes.forEach(code => expect(sameFile).toContain(code));
  expect(records).toHaveLength(6);
  await page.reload();
  const returning = page.getByRole("form", { name: "Password sign-in", exact: true });
  await returning.getByLabel("Gamertag").fill("original_demo");
  await returning.getByLabel("Password", { exact: true }).fill(password);
  await returning.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("header-tag")).toContainText("original_demo");
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toHaveCount(0);
});
}
