import { expect, it } from "vitest";
import { holding } from "./notification-fixtures";
import { dividendIncome, dividendPortfolio } from "../lib/dividend-portfolio";
import { dateInZone, followingDay, loggedToday, nextPayment, nextReminder, paymentDue, paymentReminders, reminderSchedule } from "../lib/payment-reminders";

it("totals received dividends by period without counting forecasts, interest, bonuses, future dates or top-ups", () => {
  const a = holding({ events: [{ type: "topup", date: "2026-10-01", amount: 50_000 }], payouts: [
    { kind: "actual", date: "2025-12-01", amount: 1000 }, { kind: "actual", date: "2026-09-01", amount: 2000 },
    { kind: "actual", date: "2026-10-01", amount: 212, incomeType: "dividend" }, { kind: "actual", date: "2026-10-02", amount: 211 },
    { kind: "expected", date: "2026-10-01", amount: 90000 }, { kind: "actual", date: "2026-10-01", amount: 90000, incomeType: "interest" },
    { kind: "actual", date: "2026-10-01", amount: 90000, incomeType: "bonus" }, { kind: "actual", date: "2026-11-01", amount: 90000 },
    { kind: "actual", date: "invalid", amount: 90000 }, { kind: "actual", date: "2026-10-01", amount: NaN },
    { kind: "actual", date: "2026-10-01", amount: -5 }, { kind: "actual", date: "2026-10-01", amount: 0 },
  ] });
  expect(dividendIncome([a], "2026-10-29")).toBe(3423);
  expect(dividendIncome([a], "2026-10-29", "year")).toBe(2423);
  expect(dividendIncome([a], "2026-10-29", "month")).toBe(423);
  const cash = holding({ rateType: "interest", balance: 9_999_900, payouts: [{ kind: "actual", date: "2026-10-01", amount: 9900 }] });
  const portfolio = dividendPortfolio([a, cash], "2026-10-29");
  expect(portfolio).toMatchObject({ value: 120_000, yieldPct: 5, monthlyEstimate: 500, annualEstimate: 6000, received: 3423, thisMonth: 423, thisYear: 2423 });
  expect(portfolio.history).toEqual(["05", "06", "07", "08", "09", "10"].map(month => ({ month: `2026-${month}`, income: month === "09" ? 2000 : month === "10" ? 423 : 0 })));
  expect(dividendPortfolio([], "2026-01-01")).toMatchObject({ value: 0, yieldPct: 0, received: 0 });
});
it.each([
  ["2026-01-31", "monthly", "2026-02-01", "2026-02-28"], ["2026-01-31", "monthly", "2026-03-01", "2026-03-31"],
  ["2024-02-29", "annually", "2027-01-01", "2027-02-28"], ["2024-02-29", "annually", "2028-01-01", "2028-02-29"],
  ["2000-01-31", "quarterly", "2026-12-01", "2027-01-31"], ["2027-01-31", "monthly", "2026-01-01", "2027-01-31"],
  ["2026-01-01", "daily", "2026-10-29", "2026-10-29"], ["2027-01-01", "daily", "2026-10-29", "2027-01-01"],
] as const)("preserves anchored recurrence %s / %s on %s", (anchor, frequency, day, expected) => {
  expect(nextPayment({ anchor, frequency }, day)).toBe(expected);
});
it("uses local calendar dates across DST and leap/year boundaries", () => {
  expect(dateInZone(new Date("2026-10-29T00:30:00Z"), "America/Los_Angeles")).toBe("2026-10-28");
  expect(dateInZone(new Date("2026-03-29T23:30:00Z"), "Europe/London")).toBe("2026-03-30");
  expect(followingDay("2024-02-28")).toBe("2024-02-29"); expect(followingDay("2026-12-31")).toBe("2027-01-01");
  expect(dateInZone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
it("compiles only earning schedules and excludes all financial labels/figures from the server payload", () => {
  const day = "2026-10-29", daily = holding({ id: "cash", rateType: "interest", frequency: "daily", createdAt: "bad", nextPayoutDate: "bad" });
  const actual = { kind: "actual" as const, date: day, amount: 5 };
  const accounts = [daily, holding({ id: "logged", nextPayoutDate: day, payouts: [actual] }), holding({ id: "duplicate", nextPayoutDate: day, payouts: [actual] }), holding({ balance: 0 }), holding({ ratePct: 0 }), holding({ nextPayoutDate: "bad" })];
  expect(reminderSchedule(accounts, day, "Europe/London")).toEqual({ timeZone: "Europe/London", plans: [{ anchor: day, frequency: "daily" }, { anchor: day, frequency: "monthly", skipDate: day }] });
  expect(JSON.stringify(reminderSchedule(accounts, day, "UTC"))).not.toMatch(/Private|Trading|1200|Realty|logged|cash/);
  expect(loggedToday(holding({ payouts: [{ ...actual, incomeType: "bonus" }] }), day)).toBe(false);
  expect(loggedToday(holding({ payouts: [{ ...actual, amount: Infinity }] }), day)).toBe(false);
  const reminders = paymentReminders(accounts, day);
  expect(reminders).toHaveLength(3); expect(reminders.filter(item => item.logged)).toHaveLength(2);
  expect(reminders.find(item => item.account.id === "cash")?.amount).toBeCloseTo(6000 / 365);
  expect(accounts[0].balance).toBe(120_000);
  expect(reminderSchedule([holding({ frequency: "daily", createdAt: "", nextPayoutDate: day })], day, "UTC").plans[0].anchor).toBe(day);
});
it("skips only a received payment today and advances each frequency correctly", () => {
  const plan = { anchor: "2026-01-31", frequency: "monthly" as const, skipDate: "2026-10-31" };
  expect(paymentDue(plan, "2026-10-31")).toBe(false);
  expect(paymentDue(plan, "2026-11-30")).toBe(true);
  expect(nextReminder({ timeZone: "UTC", plans: [plan] }, "2026-10-31")).toBe("2026-11-30");
  expect(nextReminder({ timeZone: "UTC", plans: [] }, "2026-10-31")).toBeNull();
});
