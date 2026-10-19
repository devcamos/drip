import { legacyAccount } from "./legacy-account-helpers";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unlock } from "./vault-helpers";

test.describe.configure({ mode: "serial" });

const onboard = legacyAccount;

async function addZopa(page: Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("Zopa");
  await page.getByPlaceholder("e.g. Rainy day pot").fill("Rainy day pot");
  await page.getByPlaceholder("3000").fill("3000");
  await page.getByPlaceholder("7").fill("7");
  await expect(page.getByText("≈ £17.50 a month")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
}

test("signup asks for a gamertag and matching password without recovery", async ({ page }) => {
  await page.goto("/#signup");
  const submit = page.getByRole("button", { name: "Create account", exact: true });
  await expect(page.getByTestId("code")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await page.getByLabel(/Gamertag/).fill("me@mail");
  await expect(page.getByText("Only letters, numbers and underscore.")).toBeVisible();
  await page.getByLabel(/Gamertag/).fill("devo_1");
  await page.getByLabel("Create password", { exact: true }).fill("Green meadow 42!");
  await page.getByLabel("Confirm new account password", { exact: true }).fill("Different password!");
  await expect(submit).toBeDisabled();
  await page.getByLabel("Confirm new account password", { exact: true }).fill("Green meadow 42!");
  await expect(submit).toBeEnabled();
});

test("add account, top up, withdraw, Trends, backup export and import", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const code = await onboard(page);
  const tag = (await page.getByTestId("header-tag").locator("b").textContent());
  expect(tag).toBe("devo");
  await addZopa(page);
  await expect(page.getByText("£3,000.00").first()).toBeVisible();

  // top-up
  await page.getByRole("button", { name: "Top up" }).click();
  await page.getByLabel("amount", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("events")).toContainText("+£500.00");
  await expect(page.getByText("£3,500.00").first()).toBeVisible();

  // withdraw: over-balance rejected, then valid
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByLabel("amount", { exact: true }).fill("99999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("can't withdraw more than the balance")).toBeVisible();
  await page.getByLabel("amount", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("events")).toContainText("−£200.00");
  await expect(page.getByText("£3,300.00").first()).toBeVisible();

  // Trends
  await page.getByRole("navigation").getByRole("button", { name: "Trends" }).click();
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  await expect(page.locator(".stat").filter({ hasText: "Total balance" }).getByText("£3,300.00", { exact: true })).toBeVisible();
  await expect(page.getByText("7.00%")).toBeVisible();
  await expect(page.getByText("Estimated balance in 1 year")).toBeVisible();

  // export
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByText("Advanced: file backups & app lock").click();
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX").fill("WRONG");
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX").fill(code);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const file = await (await dl).path();
  await expect(page.getByText("Backup saved.")).toBeVisible();
  const json = JSON.parse(readFileSync(file, "utf8"));
  expect(json.app).toBe("drip");
  expect(JSON.stringify(json)).not.toContain("Rainy");

  // import into a fresh device (new context = empty IndexedDB)
  const fresh = await page.context().browser()!.newContext();
  const p2 = await fresh.newPage();
  await p2.goto("/");
  await p2.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await p2.getByRole("button", { name: "Restore a backup" }).click();
  await p2.locator('input[type="file"]').setInputFiles(file);
  const codeInput = p2.getByLabel("Restore recovery code");
  await codeInput.fill(code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"));
  await p2.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(p2.getByText(/Wrong recovery code/)).toBeVisible();
  await codeInput.fill(code);
  await p2.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(p2.getByText("Rainy day pot")).toBeVisible();
  await expect(p2.getByTestId("header-tag")).toContainText(tag!); // gamertag restored from backup
  await expect(p2.getByText("£3,300.00").first()).toBeVisible();
  await fresh.close();
});

test("app lock: passkey required on open, recovery code fallback", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const code = await onboard(page);
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByText("Advanced: file backups & app lock").click();
  await expect(page.getByText(/screen lock only/)).toBeVisible();
  await page.getByRole("button", { name: "Turn on app lock" }).click();
  await expect(page.getByText("App lock is on.")).toBeVisible();

  // Reopening first needs the recovery code to unwrap the local key.
  await page.reload();
  await unlock(page, code);
  await expect(page.getByText("No accounts yet")).toBeVisible();

  // passkey fails -> fallback to recovery code
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
  await page.reload();
  await unlock(page, code);
  await expect(page.getByRole("heading", { name: /locked/ })).toBeVisible();
  await page.locator("input").fill("WRONG");
  await page.getByRole("button", { name: "Unlock with code" }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  await page.locator("input").fill(code);
  await page.getByRole("button", { name: "Unlock with code" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
});

test("app-lock passkey uses the gamertag as its user name and the account id as user id", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await onboard(page);
  const tag = await page.getByTestId("header-tag").locator("b").textContent();
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByText("Advanced: file backups & app lock").click();
  await page.getByRole("button", { name: "Turn on app lock" }).click();
  await expect(page.getByText("App lock is on.")).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  const userHex = Buffer.from(credentials[0].userHandle!, "base64").toString("hex");
  expect(userHex).toMatch(/^[a-f0-9]{32}$/);
  if ((credentials[0] as any).userName !== undefined) expect((credentials[0] as any).userName).toBe("devo");
  expect(tag).toBe("devo");
});

test("unsent signup names and passwords do not survive a fresh page", async ({ page }) => {
  await page.goto("/#signup");
  await page.getByLabel(/Gamertag/).fill("devo");
  await page.getByLabel("Create password", { exact: true }).fill("Green meadow 42!");
  await page.goto("about:blank"); await page.goto("/#signup");
  await expect(page.getByLabel(/Gamertag/)).toHaveValue("");
  await expect(page.getByLabel("Create password", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("code")).toHaveCount(0);
});

test("daily-interest account has no payout date and skips upcoming payouts", async ({ page }) => {
  await onboard(page);
  await page.getByRole("navigation").getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Provider").selectOption("MoneyFarm");
  await page.getByLabel("Balance").fill("10000");
  await page.getByLabel("Rate").fill("3.65");
  await page.getByLabel("Paid").selectOption("daily");
  await expect(page.getByLabel("Next payout date")).toHaveCount(0);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Per day (est.)")).toBeVisible();
  await page.getByRole("button", { name: "← Accounts" }).click();
  await expect(page.getByText(/Daily payments/)).toBeVisible();
  await expect(page.getByText("Upcoming estimated payments")).toHaveCount(0);
});

test("PWA assets: manifest icons incl. maskable, apple-touch-icon 180, favicon, iOS meta", async ({ page, request }) => {
  await page.goto("/");
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  const icons = m.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
  expect(icons).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute("sizes")).toBe("180x180");
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
  expect((await request.get("/favicon.ico")).ok()).toBe(true);
  expect(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("Drip");
  expect(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content")).toBe("black-translucent");
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content")).toBe("yes");
});
