import { expect, test } from "@playwright/test";
import { legacyAccount } from "./legacy-account-helpers";
import { releaseStock } from "../tests/saved-experience-fixtures";

test("opens a holding and offers company-specific reading without changing its balance", async ({ page }) => {
  await page.route("https://www.tradingview-widget.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Chart fixture</title>" }));
  await legacyAccount(page, "reading_demo", [releaseStock()]);
  await page.getByRole("region", { name: "Account cards" }).getByRole("button", { name: /Open Realty Income/ }).click();
  const chart = page.getByRole("dialog", { name: "Realty Income share price" });
  const reading = chart.getByRole("region", { name: "Stock reading" });
  await expect(reading.getByRole("link", { name: /Yahoo Finance/ })).toHaveAttribute("href", "https://finance.yahoo.com/quote/O/news/");
  if (process.env.DRIP_READING_CAPTURE) {
    await page.setViewportSize({ width: 390, height: 844 });
    await reading.screenshot({ path: "docs/screenshots/stock-reading/reading-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await reading.screenshot({ path: "docs/screenshots/stock-reading/reading-desktop.png" });
  }
  await expect(chart).toContainText("£2,500.00");
  await chart.getByRole("button", { name: "Account details", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stock reading" })).toBeVisible();
  await expect(page.locator(".bal")).toHaveText("£2,500.00");
});
