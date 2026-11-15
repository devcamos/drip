import { addCashAccount } from "./saved-navigation";
import { legacyAccount } from "./legacy-account-helpers";
import { test, expect, type Page } from "@playwright/test";

async function addZopa(page: Page) {
  await addCashAccount(page, true);
  await page.getByLabel("Provider", { exact: true }).selectOption("Zopa");
  await page.getByPlaceholder("e.g. Rainy day pot").fill("Rainy day pot");
  await page.getByPlaceholder("3000").fill("3000");
  await page.getByPlaceholder("7").fill("7");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("£3,000.00").first()).toBeVisible();
}

test("editing a rate with an effective date shows the rate history list", async ({ page }) => {
  await legacyAccount(page);
  await addZopa(page);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit account" })).toBeVisible();
  await page.getByLabel("Rate", { exact: true }).fill("4");
  await page.getByLabel("New rate applies from").fill("2026-01-02");
  await page.getByRole("button", { name: "Save" }).click();
  const history = page.getByRole("heading", { name: "Rate history" }).locator("xpath=..");
  await expect(page.getByRole("heading", { name: "Rate history" })).toBeVisible();
  await expect(history.getByText("4%", { exact: true })).toBeVisible();
  await expect(history.getByText("7%", { exact: true })).toBeVisible();
  await expect(history.getByText("From 2 Jan 2026")).toBeVisible();
});
