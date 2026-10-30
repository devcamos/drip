import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock, showCloudRecovery } from "./vault-helpers";
import type { Account } from "../lib/types";

const stock: Account = { id: "synthetic-stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", label: "", balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#6b2d83", payouts: [{ date: "2026-10-01", amount: 5.5, kind: "actual" }], events: [], createdAt: "2026-10-01" };
async function capture(page: Page, name: string, region?: string) {
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!process.env.DRIP_INVESTMENT_CAPTURE || width === 320) continue;
    await mkdir(process.env.DRIP_INVESTMENT_CAPTURE, { recursive: true });
    const options = { path: `${process.env.DRIP_INVESTMENT_CAPTURE}/${name}-${width}.png`, scale: "css" as const };
    if (region) await page.getByRole("group", { name: region, exact: true }).screenshot(options);
    else if (name === "portfolio") await page.getByRole("region", { name: "Your dividend holdings", exact: true }).screenshot(options);
    else { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot(options); }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}
test("saves fractional shares and foreign prices, preserves them after encrypted reload, and updates return without logging income", async ({ page, browser }) => {
  // Real local UI, IndexedDB encryption and calculations; synthetic legacy
  // fixture. This test does not mock APIs or claim hosted cloud verification.
  const code = await legacyAccount(page, "dividend_demo", [stock]);
  await page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Realty Income/ }).click();
  const summary = page.getByRole("region", { name: "Your investment", exact: true });
  await summary.getByRole("button", { name: "Add details", exact: true }).click();
  await page.getByLabel("Track shares and average price").check();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Number of shares", { exact: true }).fill("27.25750597");
  await page.getByLabel("Average purchase price per share (£)", { exact: true }).fill("44.99");
  await page.getByLabel("Original price currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Average purchase price per share (USD)", { exact: true }).fill("60.41");
  await capture(page, "edit-investment", "Investment details (optional)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary).toContainText("-£71.04 (-5.79%)");
  await expect(summary).toContainText("27.25750597");await expect(summary).toContainText("US$60.41 (£44.99)");
  await expect(summary).toContainText("5.7%");await capture(page, "investment-detail");
  await page.reload();await unlock(page, code);await expect(page.getByTestId("header-tag")).toContainText("dividend_demo");
  await page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Realty Income/ }).click();
  await expect(summary).toContainText("27.25750597");await expect(summary).toContainText("US$60.41 (£44.99)");
  await page.getByRole("button", { name: "Update balance", exact: true }).click();
  await page.getByLabel("amount", { exact: true }).fill("1400");await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary).toContainText("+£173.68 (14.16%)");
  await expect(page.getByTestId("income-history")).toContainText("£5.50");
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  const card = page.getByRole("button", { name: "Open Realty Income", exact: true });
  await expect(card).toContainText("27.25750597 shares");await expect(card).toContainText("US$60.41 (£44.99)");await expect(card).toContainText("£1,400.00");await expect(page.getByTestId("dividend-income-total")).toHaveText("£5.50");
  await capture(page, "portfolio");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Advanced: file backups & app lock", { exact: true }).click();
  await page.getByLabel("Export recovery code", { exact: true }).fill(code);
  const downloadEvent = page.waitForEvent("download");await page.getByRole("button", { name: "Export backup", exact: true }).click();const backup = await downloadEvent;
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage();await restored.goto(new URL(page.url()).origin);await showCloudRecovery(restored);
    await restored.getByRole("button", { name: "Restore a backup", exact: true }).click();await restored.getByLabel("Backup file", { exact: true }).setInputFiles((await backup.path())!);
    await restored.getByLabel("Restore recovery code", { exact: true }).fill(code);await restored.getByRole("button", { name: "Restore", exact: true }).click();
    await restored.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Realty Income/ }).click();
    const restoredStats = restored.getByRole("region", { name: "Your investment", exact: true });
    await expect(restoredStats).toContainText("27.25750597");await expect(restoredStats).toContainText("US$60.41 (£44.99)");await expect(restoredStats).toContainText("£1,400.00");
    await expect(restored.getByTestId("income-history")).toContainText("£5.50");
  } finally { await fresh.close();await backup.delete(); }
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();await card.click();await summary.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Number of shares", { exact: true })).toHaveValue("27.25750597");
  await page.getByLabel("Track shares and average price").uncheck();await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary.getByRole("button", { name: "Add details", exact: true })).toBeVisible();await expect(summary).toContainText("£1,400.00");
});
