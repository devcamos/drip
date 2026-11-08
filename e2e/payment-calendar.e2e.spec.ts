import { showAccountDetails } from "./saved-navigation";
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";
import { calendarAccount } from "../tests/payment-calendar-fixtures";

const cash = calendarAccount({
  id: "synthetic-cash", provider: "Zopa", productCategory: "easy-access",
  holdingName: undefined, rateType: "interest", balance: 3000, ratePct: 7,
});
const stock = calendarAccount({
  id: "synthetic-stock", ratePct: 6, frequency: "quarterly",
  payouts: [{ date: "2026-10-01", amount: 12.5, kind: "actual" }],
});
const daily = calendarAccount({
  id: "synthetic-daily", provider: "Biscuit", productCategory: "easy-access",
  holdingName: undefined, balance: 3650, ratePct: 1, rateType: "interest", frequency: "daily",
});

test.beforeEach(async ({ page }) => {
  // Fix Date only: real crypto, IDB events and UI timers continue normally.
  await page.clock.setFixedTime(new Date("2026-10-31T12:00:00Z"));
});

async function openCalendar(page: Page) {
  await page.getByRole("button", { name: /Payment notifications, / }).click();
  await expect(page.getByRole("region", { name: "Payment calendar", exact: true })).toBeVisible();
}
async function openMonth(page: Page, key: string) {
  const target = page.getByTestId("payment-month-" + key);
  if (!(await target.evaluate(element => (element as HTMLDetailsElement).open))) await target.locator("summary").click();
  return target;
}
async function capture(page: Page, state: string) {
  const directory = process.env.DRIP_CALENDAR_CAPTURE;
  if (directory) await mkdir(directory, { recursive: true });
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 2200 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!directory || width === 320) continue;
    await page.getByRole("region", { name: "Payment calendar", exact: true }).screenshot({
      path: directory + "/" + state + "-" + width + ".png", scale: "css",
    });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}

// Critical local user journeys only; calendar edge cases live in unit tests.
// The existing-account fixture avoids unrelated cloud signup. No API mocks.
test("an existing user views upcoming cash/dividend payments and opens the matching holding", async ({ page }) => {
  await legacyAccount(page, "calendar_demo", [cash, stock, daily]);
  await openCalendar(page);
  const first = await openMonth(page, "2026-11");
  await expect(first.getByRole("button", { name: "Open Zopa for 2026-11-15", exact: true })).toBeVisible();
  await expect(first.getByRole("button", { name: "Open Realty Income for 2026-11-15", exact: true })).toBeVisible();
  await expect(first).toContainText("daily payments, grouped");
  const following = await openMonth(page, "2026-12");
  await expect(following.getByRole("button", { name: "Open Zopa for 2026-12-15", exact: true })).toBeVisible();
  await capture(page, "monthly-calendar");
  await first.getByRole("button", { name: "Open Realty Income for 2026-11-15", exact: true }).click();
  await showAccountDetails(page);
  await expect(page.getByRole("region", { name: "Your investment", exact: true })).toContainText("£1,200.00");
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByTestId("dividend-income-total")).toHaveText("£12.50");
});

test("a user edits a payment schedule and the new calendar survives encrypted reload", async ({ page }) => {
  const code = await legacyAccount(page, "calendar_demo", [cash, stock, daily]);
  await openCalendar(page);
  const month = await openMonth(page, "2026-11");
  await month.getByRole("button", { name: "Open Zopa for 2026-11-15", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Paid", { exact: true }).selectOption("quarterly");
  await page.getByLabel("Next payout date", { exact: true }).fill("2026-11-20");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await openCalendar(page);
  const updated = await openMonth(page, "2026-11");
  await expect(updated.getByRole("button", { name: "Open Zopa for 2026-11-20", exact: true })).toBeVisible();
  const december = await openMonth(page, "2026-12");
  await expect(december.getByRole("button", { name: /Open Zopa/ })).toHaveCount(0);
  await expect(december).toContainText("Expected interest");
  await capture(page, "quarterly-calendar");
  await page.reload();
  await unlock(page, code);
  await openCalendar(page);
  const restored = await openMonth(page, "2027-02");
  await restored.getByRole("button", { name: "Open Zopa for 2027-02-20", exact: true }).click();
  await expect(page.getByText("£3,000.00", { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByTestId("dividend-income-total")).toHaveText("£12.50");
});
