import { expect, type Page } from "@playwright/test";
export async function showRecovery(page: Page) {
  if (await page.getByRole("heading", { name: "Recover your account", exact: true }).isVisible()) return;
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
}
export async function showCloudRecovery(page: Page) {
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
}
export async function unlock(page: Page, code: string, next: "accounts" | "screen-lock" = "accounts") {
  // A bookmarked/reloaded #recovery URL legitimately reopens recovery. Accept
  // either entry screen, then verify actual unlock rather than only its absence.
  await expect(page.getByRole("heading", { name: /^(Sign in to Drip|Recover your account)$/ })).toBeVisible();
  await showRecovery(page);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Recover account", exact: true }).click();
  if (next === "screen-lock") await expect(page.getByRole("heading", { name: "Drip is locked 🔒", exact: true })).toBeVisible();
  else await expect(page.getByTestId("header-tag")).toBeVisible();
}
