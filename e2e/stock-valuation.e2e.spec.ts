import { expect, test } from "@playwright/test";

test("opening a stock, entering its price and returning to Accounts updates value while keeping income separate", async ({ page }) => {
  // External transport fixtures are deterministic; actual HTTPS/provider evidence is separate.
  await page.route("https://www.tradingview-widget.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Chart fixture</title><p>No market data in this fixture.</p>" }));
  const rates: string[] = [];
  await page.route("**/api/exchange-rates?base=USD", route => {
    rates.push(route.request().url());
    return route.fulfill({ json: { base: "USD", quote: "GBP", rate: 0.75, date: new Date().toISOString().slice(0, 10), source: "Frankfurter" } });
  });
  await page.goto("/prototype/welcome");
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await page.getByRole("button", { name: /Realty Income.*£2,500/ }).click();
  const dialog = page.getByRole("dialog", { name: "Realty Income share price" });
  await expect(dialog.locator("iframe")).toHaveCount(1);
  await dialog.getByLabel("Current price per share (USD)").fill("60");
  await dialog.getByRole("button", { name: "Update demo value" }).click();
  const holding = dialog.getByRole("complementary", { name: "Your recorded holding" });
  await expect(holding).toContainText("£2,250.00");
  await expect(holding).toContainText("£48.00");
  await expect(holding).toContainText("£135.00");
  await expect(dialog.getByLabel("Holding performance")).toContainText("-£150.00 (-6.25%)");
  expect(rates).toHaveLength(1);
  const widths = await dialog.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  await dialog.getByRole("button", { name: "Back to accounts" }).click();
  await expect(page.getByRole("button", { name: /Realty Income.*£2,250.*Estimated market value/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£7,250.00");
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£6,050.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£28.33");
  await expect(page.getByRole("region", { name: "Received income" })).toContainText("£0.00");
  await page.getByRole("button", { name: "Explore share price" }).click();
  await expect(dialog.getByLabel("Current price per share (USD)")).toHaveValue("60");
  await dialog.getByRole("button", { name: "Use recorded value" }).click();
  await dialog.getByRole("button", { name: "Back to accounts" }).click();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£7,500.00");
});
