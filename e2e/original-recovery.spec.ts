import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_ORIGINAL_CAPTURE) return;
  const dir = "docs/screenshots/original-recovery"; await mkdir(dir, { recursive: true });
  for (const [device, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/${state}-${device}.png`, fullPage: true, scale: "css",
      style: 'input[type="password"], .recovery-list[data-revealed="true"] { color:transparent !important; text-shadow:none !important; caret-color:transparent !important; }' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test("signup requires the original file, resumes after refresh, and downloads the same set again", async ({ page }) => {
  // Real app, encryption, IndexedDB, password unwrap and file downloads. Only
  // the network backend is synthetic; this is not a hosted database/auth test.
  const owner = "synthetic-original-owner"; const password = "Synthetic river meadow 42!";
  let user: any; let passwordEnvelope: any; let vault: any = { version: 0, envelope: null };
  let records: any[] | undefined;
  await page.route("**/api/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const body = request.postDataJSON(); let value: any = {};
    if (path === "/api/cloud/status") value = { available: true };
    else if (path === "/api/auth/sign-in/email" && !user) return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    else if (path === "/api/auth/sign-up/email") { user = { id: owner, email: body.email, name: "original_demo" }; value = { user, token: "synthetic" }; }
    else if (path === "/api/auth/get-session") value = { user, session: { id: "synthetic", userId: owner, expiresAt: "2099-01-01T00:00:00Z" } };
    else if (path === "/api/auth/sign-in/email") value = { user, token: "synthetic" };
    else if (path === "/api/auth/gamertag-password") { passwordEnvelope = body.envelope; value = { saved: true }; }
    else if (path.startsWith("/api/auth/sign-in/gamertag")) value = { owner, envelope: passwordEnvelope };
    else if (path === "/api/cloud") {
      if (request.method() === "PUT") vault = { version: vault.version + 1, envelope: body.envelope, updated_at: new Date().toISOString() };
      value = vault;
    } else if (path === "/api/recovery-codes") {
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
  await capture(page, "required-download");
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  async function openAndDownload(state?: string) {
    const panel = page.getByRole("region", { name: "Recovery codes", exact: true });
    await panel.getByLabel("Confirm your password", { exact: true }).fill(password);
    await panel.getByRole("button", { name: "Open original recovery codes" }).click();
    await expect(panel.getByRole("button", { name: "Show recovery codes" })).toHaveAttribute("aria-expanded", "false");
    if (state) await capture(page, state);
    const downloadEvent = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download recovery codes" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("drip-recovery-codes.txt");
    return readFile((await download.path())!, "utf8");
  }
  const original = await openAndDownload("signup-original-ready");
  await capture(page, "confirm-original");
  expect(original.split("\n").filter(line => /^\d\. /.test(line))).toHaveLength(6);
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  await page.reload();
  const login = page.getByRole("form", { name: "Password sign-in", exact: true });
  await login.getByLabel("Gamertag").fill("original_demo");
  await login.getByLabel("Password", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  expect(await openAndDownload()).toBe(original);
  await page.getByRole("button", { name: "I’ve saved my recovery codes" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByTestId("header-tag")).toContainText("original_demo");
  await capture(page, "accounts-after-confirmation");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  expect(await openAndDownload("settings-original")).toBe(original);
  expect(records).toHaveLength(6);
});
