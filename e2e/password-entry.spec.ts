import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_PASSWORD_ENTRY_CAPTURE) return;
  await mkdir("docs/screenshots/password-entry", { recursive: true });
  for (const [label, width] of [["mobile", 390], ["desktop", 1280]] as const) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/password-entry/${state}-${label}.png`, fullPage: true, scale: "css", style: ".password-input input { color:transparent !important; text-shadow:none !important; caret-color:transparent !important; }" });
  }
}

test("password visibility works without altering credentials or submitting sign-in", async ({ page }) => {
  await page.goto("/#login");
  await page.getByLabel("Sign-in gamertag", { exact: true }).fill("synthetic_entry");
  const input = page.getByLabel("Password", { exact: true });
  await input.fill(" A synthetic passphrase! ");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(input).toHaveAttribute("type", "text"); await expect(input).toHaveValue(" A synthetic passphrase! ");
  await expect(page.getByRole("button", { name: "Sign in with password" })).toBeEnabled();
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(input).toHaveAttribute("type", "password");
  await capture(page, "signin");
});

test("signup explains mismatched passwords and permits independent confirmation visibility", async ({ page }) => {
  await page.goto("/#signup"); await page.getByLabel(/Gamertag/).fill("synthetic_entry");
  await page.getByLabel("Create password", { exact: true }).fill("A synthetic passphrase!");
  const confirmation = page.getByLabel("Confirm new account password", { exact: true });
  await confirmation.fill("A different passphrase!");
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Show password confirmation" }).click();
  await expect(confirmation).toHaveAttribute("type", "text");
  await expect(page.getByLabel("Create password", { exact: true })).toHaveAttribute("type", "password");
  await capture(page, "signup-mismatch");
  await confirmation.fill("A synthetic passphrase!");
  await expect(page.getByText("Passwords do not match.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
});
