import { expect, test, type Page } from "@playwright/test";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock, showCloudRecovery } from "./vault-helpers";
import { releaseHoldingsAndDebts, releaseSaver, releaseStock } from "../tests/saved-experience-fixtures";
import { applyMarketValuation } from "../lib/market-valuation";

// Actual saved app, IndexedDB and WebCrypto. The public chart/FX transports are
// deterministic here; these cases do not claim verification of market vendors.
test.beforeEach(async ({ page }) => {
  await page.route("https://www.tradingview-widget.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Public chart fixture</title>" }));
  await page.route("**/api/exchange-rates?base=USD", route => route.fulfill({ json: { base: "USD", quote: "GBP", rate: 0.75, date: new Date().toISOString().slice(0, 10), source: "Frankfurter" } }));
});
const cards = (page: Page) => page.getByRole("region", { name: "Account cards", exact: true });
async function addCredit(page: Page, provider: string, owed: string, minimum: string, planned: string) {
  await page.getByRole("button", { name: "Add an account", exact: true }).click();
  await page.getByRole("button", { name: /Credit card/ }).click();
  for (const [label, value] of [["Credit card provider", provider], ["Amount owed (£)", owed], ["APR (%)", "24.9"], ["Statement minimum payment (£)", minimum], ["Planned payment (£, optional)", planned], ["Payment due date", "2027-01-20"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add credit card", exact: true }).click();
  await expect(page.locator(".bal")).toHaveText(`£${Number(owed).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`);
  await page.getByRole("button", { name: "← Accounts", exact: true }).click();
  await expect(cards(page).getByRole("button", { name: new RegExp(provider) })).toBeVisible();
}

test("keeps multiple credit cards independently editable after encrypted reload and separates debt from money and income", async ({ page }) => {
  const code = await legacyAccount(page, "credit_demo", [releaseSaver()]);
  await addCredit(page, "Barclaycard", "1200", "35", "75");
  await addCredit(page, "Lloyds", "600", "20", "50");
  const overview = page.getByRole("region", { name: "Money overview" });
  await expect(overview).toContainText("£5,000.00"); await expect(overview).toContainText("£1,800.00"); await expect(overview).toContainText("£3,200.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£17.08");
  await cards(page).getByRole("button", { name: /Open Barclaycard/ }).click();
  await page.getByRole("button", { name: "Edit credit card", exact: true }).click();
  await page.getByLabel("Planned payment (£, optional)", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£90.00");
  await page.reload(); await unlock(page, code);
  await expect(cards(page).getByRole("button", { name: /^Open / })).toHaveCount(3);
  await cards(page).getByRole("button", { name: /Open Barclaycard/ }).click();
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£90.00");
  await page.getByRole("button", { name: "← Accounts", exact: true }).click();
  await cards(page).getByRole("button", { name: /Open Lloyds/ }).click();
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£50.00");
  await expect(page.getByRole("button", { name: "Log payout", exact: true })).toHaveCount(0);
});

test("opens each saved stock chart and explicitly revalues one holding without changing shares, purchase cost or dividend estimates", async ({ page }) => {
  const holdings = [releaseStock(), releaseStock({ id: "stock-2", holdingName: "Digital Realty", balance: 2000, ratePct: 3.2, investment: { shares: 20, averagePriceGBP: 90 } })];
  const code = await legacyAccount(page, "stock_demo", holdings);
  await cards(page).getByRole("button", { name: /Open Realty Income/ }).click();
  const stock = page.getByRole("dialog", { name: "Realty Income share price" }); await expect(stock).toBeVisible();
  await stock.getByLabel("Current price per share (USD)", { exact: true }).fill("100");
  await stock.getByRole("button", { name: "Update holding value", exact: true }).click();
  await expect(stock.getByText(/Holding value saved/)).toBeVisible();
  await expect(stock).toContainText("£3,750.00"); await expect(stock).toContainText("£135.00"); await expect(stock).toContainText("£48.00");
  await stock.getByRole("button", { name: "Account details", exact: true }).click();
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.getByLabel("amount", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".bal")).toHaveText("£3,650.00");
  await page.getByRole("button", { name: /Explore share price/ }).click();
  await expect(stock).toContainText("£129.60");
  await expect(stock).toContainText("Includes your recorded transfers since the price estimate.");
  await stock.getByRole("button", { name: "Back to accounts", exact: true }).click();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£5,650.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£16.13");
  await cards(page).getByRole("button", { name: /Open Digital Realty/ }).click();
  const other = page.getByRole("dialog", { name: "Digital Realty share price" }); await expect(other).toBeVisible(); await expect(other).toContainText("£2,000.00");
  await page.reload(); await unlock(page, code); await cards(page).getByRole("button", { name: /Open Realty Income/ }).click();
  await expect(stock).toContainText("£3,650.00"); await expect(stock).toContainText("£129.60");
  await stock.getByRole("button", { name: "Use recorded value", exact: true }).click();
  await expect(stock.getByText("Recorded value restored. Dividend income is unchanged.")).toBeVisible();
  await expect(stock).toContainText("£2,400.00");
});

test("opens the real profile, persists the owner-scoped income preference, reaches security and signs out without exposing accounts", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  const code = await legacyAccount(page, "profile_demo", releaseHoldingsAndDebts());
  await page.getByRole("button", { name: /Open profile and settings/ }).click();
  const profile = page.getByRole("dialog", { name: "Profile & settings" }); await expect(profile).toBeVisible();
  await expect(profile).toContainText("profile_demo"); await expect(profile.getByRole("region", { name: "Your profile accounts" })).toContainText("Holdings2");
  await profile.getByRole("button", { name: "Yearly", exact: true }).click(); await expect(profile.getByRole("button", { name: "Yearly", exact: true })).toHaveAttribute("aria-pressed", "true");
  await profile.getByRole("button", { name: /Security & devices/ }).click(); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.reload(); await unlock(page, code); await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£404.00");
  await page.getByRole("button", { name: /Open profile and settings/ }).click();
  await profile.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Drip", exact: true })).toBeVisible(); await expect(cards(page)).toHaveCount(0);
  await unlock(page, code); await expect(cards(page).getByRole("button", { name: /^Open / })).toHaveCount(5);
});

test("exports and restores the actual encrypted backup into a fresh browser with all holdings, credit terms and valuation baseline", async ({ page, browser }) => {
  const accounts = releaseHoldingsAndDebts(); accounts[1] = applyMarketValuation(accounts[1], { priceUSD: 100, fxRate: 0.75, fxDate: "2026-11-06" }, Date.parse("2026-11-07T12:00:00Z"));
  const code = await legacyAccount(page, "restore_demo", accounts);
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Advanced: file backups & app lock", { exact: true }).click(); await page.getByLabel("Export recovery code", { exact: true }).fill(code);
  const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click(); const file = await downloading;
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage(); await restored.route("https://www.tradingview-widget.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Public chart fixture</title>" }));
    await restored.goto(new URL(page.url()).origin); await showCloudRecovery(restored);
    await restored.getByRole("button", { name: "Restore a backup", exact: true }).click(); await restored.getByLabel("Backup file", { exact: true }).setInputFiles((await file.path())!);
    await restored.getByLabel("Restore recovery code", { exact: true }).fill(code); await restored.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(cards(restored).getByRole("button", { name: /^Open / })).toHaveCount(5); await expect(restored.getByRole("region", { name: "Money overview" })).toContainText("£8,950.00");
    await cards(restored).getByRole("button", { name: /Open Barclaycard/ }).click(); await expect(restored.getByRole("region", { name: "Credit card payment plan" })).toContainText("£75.00");
    await restored.getByRole("button", { name: "← Accounts", exact: true }).click(); await cards(restored).getByRole("button", { name: /Open Realty Income/ }).click();
    const stock = restored.getByRole("dialog", { name: "Realty Income share price" }); await expect(stock).toContainText("£3,750.00"); await expect(stock).toContainText("£135.00");
    await stock.getByRole("button", { name: "Use recorded value", exact: true }).click(); await expect(stock).toContainText("£2,500.00");
  } finally { await fresh.close(); await file.delete(); }
});
