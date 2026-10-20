import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";

// Inject only a local disk-write failure. The running UI, crypto, transaction
// handling and retry remain real; no cloud/backend responses are substituted.
async function failNextDataWrite(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === "kv" && key === "data") {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("Synthetic disk failure", "QuotaExceededError");
      }
      return put.call(this, value, key);
    };
  });
}
async function capture(page: Page, state: string, region: string) {
  if (!process.env.DRIP_UI_CAPTURE) return;
  await mkdir("docs/screenshots/signup-and-sync-confidence", { recursive: true });
  for (const [device, width] of [["mobile", 390], ["desktop", 1280]] as const) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("region", { name: region }).screenshot({ path: `docs/screenshots/signup-and-sync-confidence/${state}-${device}.png`, scale: "css" });
  }
}

test("failed projection and income-removal writes retain values and retry safely", async ({ page }) => {
  await legacyAccount(page, "save_demo");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("Zopa");
  await page.getByLabel("Balance", { exact: true }).fill("3000");
  await page.getByLabel("Rate", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Income amount", { exact: true }).fill("22.65");
  await page.getByRole("button", { name: "Record income", exact: true }).click();
  await expect(page.getByTestId("income-history")).toContainText("£22.65");
  await page.getByRole("navigation").getByRole("button", { name: "Trends", exact: true }).click();
  await page.getByRole("button", { name: "Edit projection" }).click();
  await page.getByLabel("Planned monthly top-up (£)").fill("200");
  await page.getByLabel("Project ahead").selectOption("3");
  await failNextDataWrite(page);
  await page.getByRole("button", { name: "Save projection" }).click();
  await expect(page.getByText("Projection could not be saved. Your entries are kept; retry Save projection.")).toBeVisible();
  await expect(page.getByLabel("Planned monthly top-up (£)")).toHaveValue("200");
  await expect(page.getByLabel("Project ahead")).toHaveValue("3");
  await capture(page, "projection-save-failure", "Balance chart");
  await page.getByRole("button", { name: "Save projection" }).click();
  await expect(page.getByRole("form", { name: "Projection assumptions" })).toHaveCount(0);
  await expect(page.getByText("£3,000.00 today · £200.00 planned monthly top-up")).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: /Zopa/ }).click();
  await page.getByText("View payments", { exact: true }).click();
  page.on("dialog", d => d.accept());
  await failNextDataWrite(page);
  await page.getByRole("button", { name: /Remove interest payment/ }).click();
  await expect(page.getByText("Payment removal could not be saved. Keep Drip open and retry.")).toBeVisible();
  await expect(page.getByTestId("income-history")).toContainText("£22.65");
  await expect(page.locator(".bal")).toHaveText("£3,000.00");
  await capture(page, "income-remove-failure", "Income history");
  await page.getByRole("button", { name: /Remove interest payment/ }).click();
  await expect(page.getByText("Payment removed. Your balance is unchanged.")).toBeVisible();
  await expect(page.getByText("No income logged yet.")).toBeVisible();
  await expect(page.locator(".bal")).toHaveText("£3,000.00");
});
