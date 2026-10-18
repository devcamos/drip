import { expect, type Page } from "@playwright/test";
export async function unlock(page: Page, code: string) {
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toBeVisible();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Unlock Drip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toHaveCount(0);
}
