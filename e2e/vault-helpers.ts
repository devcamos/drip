import { expect, type Page } from "@playwright/test";
export async function showRecovery(page: Page) {
  if (await page.getByRole("heading", { name: "Recover your account", exact: true }).isVisible()) return;
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
}
export async function showCloudRecovery(page: Page) {
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
}
export async function unlock(page: Page, code: string) {
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toBeVisible();
  await showRecovery(page);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Unlock Drip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toHaveCount(0);
}
