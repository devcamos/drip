import { expect, test } from "@playwright/test";

test("opening a dividend holding loads its chart and ranges without changing money or income", async ({ page }) => {
  // Deterministic frame fixture verifies Drip's controls, not external market data.
  const chartRequests: string[] = [];
  await page.route("https://www.tradingview-widget.com/**", async route => {
    chartRequests.push(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Chart transport fixture</title><p>Deterministic frame fixture. No market data.</p>" });
  });
  await page.goto("/prototype/welcome");
  await page.getByRole("group", { name: "Preview screen" }).getByRole("button", { name: "Your accounts" }).click();
  await page.getByRole("button", { name: /Realty Income.*£2,500/ }).click();
  const trigger = page.getByRole("button", { name: /Realty Income.*£2,500/ });
  const dialog = page.getByRole("dialog", { name: "Realty Income share price" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveCount(1);
  await expect.poll(() => chartRequests.length).toBe(1);
  await expect(dialog.getByRole("status")).toContainText(/frame opened/i);
  await dialog.getByRole("group", { name: "Price history range" }).getByRole("button", { name: "3 months", exact: true }).click();
  await expect(dialog.locator("iframe")).toHaveCount(1);
  await expect(dialog.getByRole("status")).toContainText(/frame opened/i);
  await expect.poll(() => chartRequests.length).toBe(2);
  const config = JSON.parse(decodeURIComponent(new URL(await dialog.locator("iframe").getAttribute("src") as string).hash.slice(1)));
  expect(config).toMatchObject({ symbols: [["Realty Income", "NYSE:O|1D"]], dateRanges: ["3m|1D"] });
  await dialog.getByRole("group", { name: "Price history range" }).getByRole("button", { name: "1 year", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(/frame opened/i);
  await expect.poll(() => chartRequests.length).toBe(3);
  const yearConfig = JSON.parse(decodeURIComponent(new URL(await dialog.locator("iframe").getAttribute("src") as string).hash.slice(1)));
  expect(yearConfig.dateRanges).toEqual(["12m|1D"]);
  const holding = dialog.getByRole("complementary", { name: "Your recorded holding" });
  await expect(holding).toContainText("£2,500.00");
  await expect(holding).toContainText("£48.00");
  const bounds = await dialog.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
  await dialog.getByRole("button", { name: "Hide chart" }).click();
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£7,500.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£28.33");
  await expect(page.getByRole("region", { name: "Received income" })).toContainText("£0.00");
});
