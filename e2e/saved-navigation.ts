import { expect, type Page } from "@playwright/test";

/** Open an ordinary cash form through the real product chooser. */
export async function addCashAccount(page: Page, fromTab = false) {
  if (fromTab) await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  else await page.getByRole("button", { name: "Add an account", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "What would you like to track?", exact: true });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: /Cash savings/ }).click();
  await expect(page.getByLabel("Product category", { exact: true })).toBeVisible();
}

/** Sign-out lives in the real profile; older-build tests retain their old UI. */
export async function signOutFromProfile(page: Page) {
  const profile = page.getByRole("dialog", { name: "Profile & settings", exact: true });
  const avatar = page.getByRole("button", { name: /Open profile and settings for/ });
  if (!await profile.isVisible() && await avatar.isVisible()) await avatar.click();
  const button = await profile.isVisible() ? profile.getByRole("button", { name: "Sign out", exact: true }) : page.getByRole("button", { name: "Sign out", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

/** Financial actions remain on the saved detail beneath the market dialog. */
export async function showAccountDetails(page: Page) {
  await expect(page.getByRole("heading", { name: /^(Add account|Edit account)$/ })).toHaveCount(0);
  const market = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close share price view", exact: true }) });
  const explore = page.getByRole("button", { name: "Explore share price", exact: true });
  const updateBalance = page.getByRole("button", { name: "Update balance", exact: true });
  // Wait until the saved detail has mounted. Do not use locator.or().toBeVisible():
  // once a configured holding opens, the market dialog and Update balance are both
  // present, and that check fails Playwright's strict mode.
  await expect.poll(async () => (await market.isVisible()) || (await explore.isVisible()) || (await updateBalance.isVisible())).toBe(true);
  // Configured holdings auto-open the market dialog before paint. After it is
  // dismissed, Explore share price stays visible and the dialog stays closed.
  if (await market.isVisible()) {
    await market.getByRole("button", { name: "Account details", exact: true }).click();
    await expect(market).toBeHidden();
  }
}
