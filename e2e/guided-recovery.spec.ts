import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { legacyAccount } from "./legacy-account-helpers";
import { withAuthRetry, finishSignupRecovery } from "./auth-helpers";

async function authenticator(page: Page, context: BrowserContext) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
  } });
}
async function capture(page: Page, state: string) {
  if (!process.env.DRIP_RECOVERY_CAPTURE) return;
  const dir = "docs/screenshots/guided-recovery"; await mkdir(dir, { recursive: true });
  for (const [device, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${dir}/${state}-${device}.png`, fullPage: true, scale: "css", style: 'input[type="password"], .recovery-list[data-revealed="true"] { color:transparent !important; text-shadow:none !important; caret-color:transparent !important; }' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test("forgotten credentials guidance and local file import recover actual encrypted accounts", async ({ page }) => {
  const code = await legacyAccount(page, "recovery_demo", [{
    id: "savings-demo", provider: "Zopa", label: "", balance: 3200, ratePct: 7, rateType: "interest",
    frequency: "monthly", nextPayoutDate: "2026-11-01", payouts: [], colour: "#BA794A", createdAt: "2026-10-01",
  }]);
  await expect(page.getByRole("button", { name: "Set up recovery", exact: true })).toBeVisible();
  await capture(page, "recovery-setup-task");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry cloud sign-out", exact: true })).toHaveCount(0, { timeout: 15_000 });
  await page.getByText("I can’t find my password or recovery codes", { exact: true }).click();
  await expect(page.getByText(/drip-recovery-codes.txt/)).toBeVisible();
  await capture(page, "missing-credentials");
  await page.getByLabel("Recovery codes file").setInputFiles({ name: "drip-recovery-codes.txt", mimeType: "text/plain", buffer: Buffer.from(`Drip recovery codes\n1. ${code}`) });
  await expect(page.getByText("1 recovery code loaded. Your file stays on this device.")).toBeVisible();
  await page.getByRole("button", { name: "Recover account", exact: true }).click();
  await expect(page.getByRole("region", { name: "Account cards" })).toContainText("£3,200.00");
});

test("forgotten-password screen offers the configured encrypted unlock passkey", async ({ page, context }) => {
  await authenticator(page, context);
  const code = await legacyAccount(page, "passkey_demo");
  await page.getByRole("button", { name: "Set up recovery", exact: true }).click();
  await page.getByLabel("Recovery code to set up passkey unlock").fill(code);
  await page.getByRole("button", { name: "Set up passkey unlock", exact: true }).click();
  await expect(page.getByText(/Passkey saved and verified/)).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use your saved unlock passkey" })).toBeVisible();
  await capture(page, "passkey-recovery");
  await page.getByRole("button", { name: "Unlock with passkey", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("passkey_demo");
  await expect(page.getByRole("button", { name: "Set up recovery", exact: true })).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  const form = page.getByRole("region", { name: "Sign-in and password" });
  await form.getByRole("button", { name: "Saved unlock passkey", exact: true }).click();
  await capture(page, "passkey-password-reset");
});

test("password setup creates a verified passkey, which resets a forgotten password and restores the same cloud data", async ({ page, context, browser, baseURL }) => {
  // Opt-in integration: creates synthetic cloud records; ordinary CI has no database credentials.
  // Run with DRIP_CLOUD_E2E=1 only against the isolated Preview database.
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database.");
  test.setTimeout(180_000);
  await authenticator(page, context);
  const handle = "rec_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const oldPassword = "Synthetic old meadow 42!", newPassword = "Synthetic new waterfall 73!";
  await page.goto("/#signup");
  await page.getByLabel(/^Gamertag/).fill(handle);
  await page.getByLabel("Create password", { exact: true }).fill(oldPassword);
  await page.getByLabel("Confirm new account password", { exact: true }).fill(oldPassword);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Create account", exact: true }).click(), page.getByRole("heading", { name: "Save your recovery codes" }));
  await finishSignupRecovery(page);
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Balance", { exact: true }).fill("3200"); await page.getByLabel("Rate", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^(Cloud copy is up to date\.|Encrypted cloud copy saved\.)$/)).toBeVisible({ timeout: 75_000 });
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Confirm your password to set up passkey unlock").fill(oldPassword);
  await page.getByRole("button", { name: "Set up passkey unlock", exact: true }).click();
  await expect(page.getByText(/Passkey saved and verified/)).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByRole("button", { name: "Unlock with passkey", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  const form = page.getByRole("region", { name: "Sign-in and password" });
  await form.getByRole("button", { name: "Saved unlock passkey", exact: true }).click();
  await form.getByLabel("New password", { exact: true }).fill(newPassword);
  await form.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await withAuthRetry(page, () => form.getByRole("button", { name: "Save password" }).click(), form.getByText(/Password saved/));
  const codes = page.getByRole("region", { name: "Recovery codes", exact: true });
  await codes.getByRole("button", { name: "Confirm with saved passkey" }).click();
  await withAuthRetry(page, () => codes.getByRole("button", { name: "Open original recovery codes" }).click(), codes.getByRole("button", { name: "Download recovery codes" }));
  await expect(codes.getByRole("button", { name: "Show recovery codes" })).toHaveAttribute("aria-expanded", "false");
  await capture(page, "recovery-codes-ready");
  const downloadEvent = page.waitForEvent("download"); await codes.getByRole("button", { name: "Download recovery codes" }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toBe("drip-recovery-codes.txt");
  await codes.getByRole("button", { name: "I’ve saved my recovery codes" }).click();
  await expect(codes.getByText(/Recovery setup complete/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const login = page.getByRole("form", { name: "Password sign-in", exact: true });
  await login.getByLabel("Gamertag").fill(handle); await login.getByLabel("Password", { exact: true }).fill(oldPassword);
  await withAuthRetry(page, () => login.getByRole("button", { name: "Sign in" }).click(), login.getByText("Gamertag or password is incorrect."));
  await login.getByLabel("Password", { exact: true }).fill(newPassword);
  await withAuthRetry(page, () => login.getByRole("button", { name: "Sign in" }).click(), page.getByTestId("header-tag"));
  await expect(page.getByRole("region", { name: "Account cards" })).toContainText("£3,200.00");
  const fresh = await browser.newContext(); const other = await fresh.newPage();
  try {
    await other.goto(baseURL!);
    await other.getByLabel("Gamertag").fill(handle); await other.getByLabel("Password", { exact: true }).fill(newPassword);
    await withAuthRetry(other, () => other.getByRole("button", { name: "Sign in" }).click(), other.getByTestId("header-tag"));
    await expect(other.getByRole("region", { name: "Account cards" })).toContainText("£3,200.00");
    other.on("dialog", dialog => dialog.accept()); await other.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect.poll(async () => (await other.request.get(`${baseURL}/api/auth/get-session`)).json()).toBeNull();
  } finally { await fresh.close(); }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(async () => (await page.request.get(`${baseURL}/api/auth/get-session`)).json()).toBeNull();
});
