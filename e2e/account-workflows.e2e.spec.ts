import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import { releaseDebt, releaseSaver, releaseStock } from "../tests/saved-experience-fixtures";

const nav = (page: Page, name: string) => page.getByRole("navigation").getByRole("button", { name, exact: true });
async function detail(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`Open ${name}`) }).click();
  const dialog = page.getByRole("dialog", { name: /share price/ });
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Account details", exact: true }).click();
}
async function capture(page: Page, name: string) {
  if (!process.env.DRIP_UI_CAPTURE) return;
  await mkdir(process.env.DRIP_UI_CAPTURE, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${process.env.DRIP_UI_CAPTURE}/${name}-${width}.png`, fullPage: true });
  }
}
test.beforeEach(async ({ page }) => {
  // Local UI/persistence acceptance only. Hosted push delivery has separate evidence.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: url.pathname === "/api/notifications/config" ? 200 : 503, json: url.pathname === "/api/notifications/config" ? { available: false } : { error: "Offline UI fixture" } });
    return route.continue();
  });
});

test("future transfers cannot change current money and unsaved edits survive cancelled navigation", async ({ page }) => {
  const code = await legacyAccount(page, "workflow_dates", [releaseSaver()]); await detail(page, "Zopa");
  await page.getByRole("button", { name: "Top up", exact: true }).click();
  await page.getByLabel("amount", { exact: true }).fill("500"); await page.getByLabel("date", { exact: true }).fill("2099-01-01");
  await expect(page.getByRole("alert").filter({ hasText: "Future transactions" })).toBeVisible(); await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByLabel("Balance", { exact: true }).fill("6000");
  await expect(page.getByTestId("local-save-status")).toHaveText("Unsaved changes.");
  page.once("dialog", dialog => dialog.dismiss()); await nav(page, "Accounts").click(); await expect(page.getByLabel("Balance", { exact: true })).toHaveValue("6000");
  page.once("dialog", dialog => dialog.accept()); await nav(page, "Accounts").click();
  await page.reload(); await unlock(page, code); await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£5,000.00");
});

test("stock position review, archive and restore preserve received dividends", async ({ page }) => {
  const day = new Date().toISOString().slice(0, 10);
  await legacyAccount(page, "workflow_stock", [releaseStock({ payouts: [{ date: day, amount: 100, kind: "actual", incomeType: "dividend" }] })]); await detail(page, "Realty Income");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click(); await page.getByLabel("amount", { exact: true }).fill("2500"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Share position needs review" })).toBeVisible(); await capture(page, "share-review");
  await page.getByRole("button", { name: /Explore share price/ }).click(); const dialog = page.getByRole("dialog", { name: /share price/ });
  await expect(dialog.getByRole("button", { name: "Update holding value" })).toBeDisabled(); await dialog.getByRole("button", { name: "Edit holding details" }).click();
  await page.getByLabel("Number of shares", { exact: true }).fill("0"); await page.getByLabel(/I have checked these share details/).check(); await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: "Account details", exact: true }).click();
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Archive account", exact: true }).click();
  await nav(page, "Portfolio").click(); await expect(page.getByTestId("dividend-income-total")).toHaveText("£100.00");
  await nav(page, "Settings").click(); await page.getByRole("button", { name: /Archived accounts/ }).click(); await capture(page, "archived-history");
  await page.getByRole("button", { name: "Restore Realty Income", exact: true }).click(); await expect(page.getByText("No archived accounts.")).toBeVisible();
  await nav(page, "Portfolio").click(); await expect(page.getByTestId("dividend-income-total")).toHaveText("£100.00");
});

test("credit-card reminders and calendar stay separate from income and paid statements survive reload", async ({ page }) => {
  const day = new Date().toISOString().slice(0, 10), future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const code = await legacyAccount(page, "workflow_debt", [releaseSaver({ nextPayoutDate: day }), releaseDebt({ nextPayoutDate: day }), releaseDebt({ id: "second-card", provider: "Lloyds", nextPayoutDate: future })]);
  await page.getByRole("button", { name: /Payment notifications/ }).click(); const today = page.getByRole("region", { name: "Today", exact: true });
  await expect(today.getByText("Barclaycard", { exact: true })).toBeVisible(); await expect(today).toContainText("Repayment"); await expect(today).toContainText("Zopa");
  const calendar = page.getByRole("region", { name: "Payment calendar", exact: true }); await expect(calendar).toContainText("repayments"); await capture(page, "debt-reminders");
  await today.getByRole("listitem").filter({ hasText: "Barclaycard" }).getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Mark statement paid", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Statement marked paid" })).toBeVisible();
  await page.reload(); await unlock(page, code); await page.getByRole("button", { name: /Payment notifications/ }).click();
  await expect(page.getByRole("region", { name: "Today", exact: true })).not.toContainText("Barclaycard");
  await nav(page, "Accounts").click(); await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£2,400.00");
});
