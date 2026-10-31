import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { addMonths } from "../lib/maths";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import type { Account } from "../lib/types";

async function capture(page: Page, state: string) {
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 2200 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.DRIP_CALENDAR_CAPTURE && width !== 320) {
      await mkdir(process.env.DRIP_CALENDAR_CAPTURE, { recursive: true });
      await page.getByRole("region", { name: "Payment calendar", exact: true }).screenshot({ path: `${process.env.DRIP_CALENDAR_CAPTURE}/${state}-${width}.png`, scale: "css" });
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}

test("a recurring payment calendar updates from edited dates/frequency and preserves received income through encrypted reload", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
  const anchor = addMonths(month + "-15", 1), anchorMonth = anchor.slice(0, 7), afterMonth = addMonths(anchor.slice(0, 7) + "-01", 1).slice(0, 7);
  const cash: Account = { id: "synthetic-cash", provider: "Zopa", productCategory: "easy-access", label: "", balance: 3000, ratePct: 7, rateType: "interest", frequency: "monthly", nextPayoutDate: anchor, colour: "#6b2d83", payouts: [], events: [], createdAt: month + "-01" };
  const stock: Account = { ...cash, id: "synthetic-stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", balance: 1200, ratePct: 6, frequency: "quarterly", rateType: "dividend", payouts: [{ date: month + "-01", amount: 12.5, kind: "actual" }] };
  const daily: Account = { ...cash, id: "synthetic-daily", provider: "Biscuit", balance: 3650, ratePct: 1, frequency: "daily", nextPayoutDate: today };
  // Actual app, encryption and schedule arithmetic. No API response mocks.
  const code = await legacyAccount(page, "calendar_demo", [cash, stock, daily]);
  const bell = () => page.getByRole("button", { name: /Payment notifications, / }).click();
  const calendar = page.getByRole("region", { name: "Payment calendar", exact: true });
  const openMonth = async (key: string) => {
    const target = calendar.getByTestId(`payment-month-${key}`);
    if (!(await target.evaluate(element => (element as HTMLDetailsElement).open))) await target.locator("summary").click();
    return target;
  };
  await bell();
  const first = await openMonth(anchorMonth);
  await expect(first.getByRole("button", { name: `Open Zopa for ${anchor}`, exact: true })).toBeVisible();
  await expect(first).toContainText("daily payments, grouped");
  const second = await openMonth(afterMonth);
  await expect(second.getByRole("button", { name: `Open Zopa for ${addMonths(anchor, 1)}`, exact: true })).toBeVisible();
  await capture(page, "monthly-calendar");
  await first.getByRole("button", { name: `Open Zopa for ${anchor}`, exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Paid", { exact: true }).selectOption("quarterly");
  const edited = anchor.slice(0, 7) + "-20";
  await page.getByLabel("Next payout date", { exact: true }).fill(edited);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await bell();
  const updated = await openMonth(anchorMonth);
  await expect(updated.getByRole("button", { name: `Open Zopa for ${edited}`, exact: true })).toBeVisible();
  const noCash = await openMonth(afterMonth);
  await expect(noCash.getByRole("button", { name: /Open Zopa/ })).toHaveCount(0);
  await expect(noCash).toContainText("Expected interest");
  await capture(page, "quarterly-calendar");
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByTestId("dividend-income-total")).toHaveText("£12.50");
  await page.reload(); await unlock(page, code); await bell();
  const restored = await openMonth(addMonths(edited, 3).slice(0, 7));
  await expect(restored.getByRole("button", { name: `Open Zopa for ${addMonths(edited, 3)}`, exact: true })).toBeVisible();
  await restored.getByRole("button", { name: `Open Zopa for ${addMonths(edited, 3)}`, exact: true }).click();
  await expect(page.getByText("£3,000.00", { exact: true })).toBeVisible();
});
