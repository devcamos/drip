import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import type { Account } from "../lib/types";

const stock: Account = { id: "synthetic-fx-stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", label: "", balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#6b2d83", payouts: [{ date: "2026-10-01", amount: 5.5, kind: "actual" }], events: [], createdAt: "2026-10-01", investment: { shares: 27.25750597, averagePriceGBP: 44.99, originalPrice: { currency: "USD", averagePrice: 60.41 } } };

async function capture(page: Page, state: string) {
  for (const width of [390, 1280, 320]) {
    // Fit the whole target panel above the fixed navigation while capturing;
    // otherwise a tall element screenshot can include the unrelated tab bar.
    await page.setViewportSize({ width, height: 1400 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.DRIP_FX_CAPTURE && width !== 320) {
      await mkdir(process.env.DRIP_FX_CAPTURE, { recursive: true });
      await page.getByRole("region", { name: "Your investment", exact: true }).screenshot({ path: `${process.env.DRIP_FX_CAPTURE}/${state}-${width}.png`, scale: "css" });
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}

test("daily currency estimates preserve saved balance, purchase cost and income through failure, retry and encrypted reload", async ({ page, context }) => {
  // Real app/calculation/encryption; only the public FX response is synthetic
  // for deterministic screenshots. Actual public upstream proof is separate.
  let fail = false, calls = 0;
  const date = new Date().toISOString().slice(0, 10);
  await context.route("**/api/exchange-rates?base=USD", async route => {
    calls++;
    expect(new URL(route.request().url()).search).toBe("?base=USD");
    if (fail) return route.abort("internetdisconnected");
    return route.fulfill({ json: { base: "USD", quote: "GBP", rate: 0.75, date, source: "Frankfurter" } });
  });
  const code = await legacyAccount(page, "currency_demo", [stock]);
  const open = async () => {
    await page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Realty Income/ }).click();
    await page.getByText("Convert a share price to GBP", { exact: true }).click();
  };
  await open(); expect(calls).toBe(0);
  await page.getByLabel("Current price per share (USD)").fill("60");
  await page.getByRole("button", { name: "Convert to GBP", exact: true }).click();
  await expect(page.getByLabel("Converted holding estimate")).toContainText("£1,226.59");
  await expect(page.getByLabel("Converted holding estimate")).toContainText("Estimated value in GBP");
  await expect(page.getByText(`Frankfurter · Rate dated ${date} · 1 USD = 0.75000 GBP`)).toBeVisible();
  const summary = page.getByRole("region", { name: "Your investment", exact: true });
  await expect(summary).toContainText("£1,155.28"); await expect(summary).toContainText("US$60.41 (£44.99)"); await expect(summary).toContainText("5.7%");
  await expect(page.getByTestId("income-history")).toContainText("£5.50");
  await capture(page, "daily-conversion");
  fail = true;
  await page.getByRole("button", { name: "Refresh conversion", exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText("Showing the previously loaded, dated rate");
  await expect(page.getByLabel("Converted holding estimate")).toContainText("£1,226.59");
  await capture(page, "last-loaded-rate");
  await page.reload(); await unlock(page, code); await open();
  await expect(summary).toContainText("£1,155.28"); await expect(summary).toContainText("US$60.41 (£44.99)");
  await expect(page.getByLabel("Current price per share (USD)")).toHaveValue("");
  await expect(page.getByLabel("Converted holding estimate")).toHaveCount(0);
  await page.getByLabel("Current price per share (USD)").fill("60");
  await page.getByRole("button", { name: "Convert to GBP", exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText("Your saved balance is unchanged");
  await expect(page.getByLabel("Converted holding estimate")).toHaveCount(0);
  await capture(page, "rate-unavailable");
  fail = false; await page.getByRole("button", { name: "Convert to GBP", exact: true }).click();
  await expect(page.getByLabel("Converted holding estimate")).toContainText("£1,226.59");
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Realty Income", exact: true })).toContainText("£1,155.28");
  await expect(page.getByTestId("dividend-income-total")).toHaveText("£5.50");
});
