import { expect, type Page } from "@playwright/test";
export async function showRecovery(page: Page) {
  const summary = page.getByText("Forgot password? Recover with a code", { exact: true });
  if (!(await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open))) await summary.click();
}
export async function showCloudRecovery(page: Page) {
  await page.getByText("Forgot password? Recover an account", { exact: true }).click();
}
export async function unlock(page: Page, code: string) {
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toBeVisible();
  await showRecovery(page);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Unlock Drip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unlock Drip", exact: true })).toHaveCount(0);
}
