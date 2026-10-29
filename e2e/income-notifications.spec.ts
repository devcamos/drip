import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import type { Account } from "../lib/types";
const today = new Date().toLocaleDateString("en-CA"), month = today.slice(0,7);
const account = (id: string, provider: string, balance: number, ratePct: number, rateType: "interest"|"dividend", holdingName?: string): Account => ({ id, productCategory: rateType === "dividend" ? "stocks-funds" : "easy-access", provider, balance, ratePct, rateType, holdingName, label: "", frequency: "monthly", nextPayoutDate: today, colour: "#176b9a", createdAt: `${month}-01`, payouts: [{ kind: "actual", date: `${month}-01`, amount: rateType === "dividend" ? 12.50 : 8, incomeType: rateType }] });
test("portfolio and reminders work on saved encrypted accounts at mobile and desktop sizes", async ({ page }) => {
  await legacyAccount(page, "incometest", [account("stock", "Trading212", 3000, 5, "dividend", "Realty Income"), account("fund", "Vanguard", 6000, 4, "dividend", "Global dividend fund"), account("cash", "Zopa", 2000, 4.5, "interest")]);
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByTestId("dividend-income-total")).toHaveText("£25.00");
  const directory = process.env.DRIP_UI_CAPTURE;
  if (directory) await mkdir(directory, { recursive: true });
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (directory && width !== 320) await page.screenshot({ path: `${directory}/portfolio-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: /Payment notifications, / }).click();
  await expect(page.getByRole("heading", { name: "Payment notifications", exact: true })).toBeVisible();
  await expect(page.getByText(/Phone notifications are not available on this deployment yet/)).toBeVisible();
  await expect(page.getByText("Realty Income", { exact: true })).toBeVisible(); await expect(page.getByText("Zopa", { exact: true })).toBeVisible();
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({width,height:900}); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (directory && width !== 320) await page.screenshot({ path: `${directory}/reminders-${width}.png`, fullPage: true });
  }
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click(); await page.getByRole("button", { name: "Add holding" }).click();
  await expect(page.getByLabel("Product category", { exact: true })).toHaveValue("stocks-funds"); await expect(page.getByLabel("Provider", { exact: true })).toHaveValue("Trading212");
});
