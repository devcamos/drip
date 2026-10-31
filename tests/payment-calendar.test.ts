import { expect, it } from "vitest";
import { paymentCalendar } from "../lib/payment-calendar";
import { recordedIncome } from "../lib/maths";
import { holding } from "./notification-fixtures";

it("projects a complete rolling year of monthly, quarterly and annual payments without recording income", () => {
  const accounts = [holding({ id: "monthly", balance: 3000, ratePct: 7, nextPayoutDate: "2026-11-15", payouts: [{ date: "2026-10-01", amount: 12.5, kind: "actual" }] }), holding({ id: "quarterly", frequency: "quarterly", nextPayoutDate: "2026-11-15" }), holding({ id: "yearly", frequency: "annually", nextPayoutDate: "2026-11-15" })];
  const before = structuredClone(accounts), income = recordedIncome(accounts, undefined, "2026-10-31");
  const result = paymentCalendar(accounts, "2026-10-31")!;
  expect(result.from).toBe("2026-11-01"); expect(result.through).toBe("2027-10-31"); expect(result.months).toHaveLength(12);
  const rows = result.months.flatMap(month => month.payments);
  expect(rows.filter(row => row.account.id === "monthly")).toHaveLength(12);
  expect(rows.filter(row => row.account.id === "quarterly").map(row => row.date)).toEqual(["2026-11-15", "2027-02-15", "2027-05-15", "2027-08-15"]);
  expect(rows.filter(row => row.account.id === "yearly")).toHaveLength(1);
  expect(result.months[0].amount).toBe(17.5 + 15 + 60);
  expect(accounts).toEqual(before); expect(recordedIncome(accounts, undefined, "2026-10-31")).toBe(income);
});

it("keeps month-end and leap-day anchors rather than advancing from a clamped occurrence", () => {
  const monthly = paymentCalendar([holding({ nextPayoutDate: "2027-01-31" })], "2027-01-30")!;
  expect(monthly.months.flatMap(month => month.payments).slice(0, 4).map(row => row.date)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  const quarter = paymentCalendar([holding({ frequency: "quarterly", nextPayoutDate: "2027-01-31" })], "2027-01-30")!;
  expect(quarter.months.flatMap(month => month.payments).map(row => row.date)).toEqual(["2027-01-31", "2027-04-30", "2027-07-31", "2027-10-31"]);
  for (const [today, expected] of [["2025-02-01", "2025-02-28"], ["2027-03-01", "2028-02-29"]]) {
    const calendar = paymentCalendar([holding({ frequency: "annually", nextPayoutDate: "2024-02-29" })], today)!;
    expect(calendar.months.flatMap(month => month.payments).map(row => row.date)).toEqual([expected]);
  }
});

it("groups daily payments and counts actual calendar days, including leap years and future start dates", () => {
  const daily = holding({ frequency: "daily", rateType: "interest", balance: 3650, ratePct: 1, createdAt: "2020-01-01" });
  const calendar = paymentCalendar([daily], "2026-10-31")!;
  expect(calendar.months[0].payments[0]).toMatchObject({ date: "2026-11-01", through: "2026-11-30", occurrences: 30, amount: 3 });
  expect(calendar.months.reduce((sum, month) => sum + month.count, 0)).toBe(365);
  expect(paymentCalendar([{ ...daily, createdAt: "2026-11-10" }], "2026-10-31")!.months[0].payments[0].occurrences).toBe(21);
  const leap = paymentCalendar([daily], "2028-01-31")!;
  expect(leap.months[0].count).toBe(29); expect(leap.months.reduce((sum, month) => sum + month.count, 0)).toBe(366);
});

it("recalculates all future dates after anchor/frequency edits and does not include one-off bonuses", () => {
  const account = holding({ nextPayoutDate: "2026-11-15", bonus: { amount: 999, expectedDate: "2026-11-20" } });
  const before = paymentCalendar([account], "2026-10-31")!;
  expect(before.months[0].amount).toBe(5);
  const updated = paymentCalendar([{ ...account, nextPayoutDate: "2026-11-20", frequency: "quarterly" }], "2026-10-31")!;
  expect(updated.months.flatMap(month => month.payments).map(row => row.date)).toEqual(["2026-11-20", "2027-02-20", "2027-05-20", "2027-08-20"]);
  expect(updated.months[1].payments).toEqual([]);
});

it("bounds a partial-month rolling window and omits payments outside the horizon or non-earning schedules", () => {
  const calendar = paymentCalendar([holding({ nextPayoutDate: "2000-01-15" }), holding({ id: "outside", nextPayoutDate: "2027-11-16", frequency: "annually" }), holding({ balance: 0 }), holding({ ratePct: 0 }), holding({ nextPayoutDate: "invalid" }), holding({ balance: Infinity })], "2026-11-15")!;
  expect(calendar.from).toBe("2026-11-16"); expect(calendar.through).toBe("2027-11-15"); expect(calendar.months).toHaveLength(13);
  const rows = calendar.months.flatMap(month => month.payments);
  expect(rows).toHaveLength(12); expect(rows[0].date).toBe("2026-12-15"); expect(rows.at(-1)!.date).toBe("2027-11-15");
  expect(paymentCalendar([], "invalid")).toBeNull(); expect(paymentCalendar([], "9999-12-31")).toBeNull();
  expect(paymentCalendar([], "2026-10-31")!.months.every(month => month.count === 0 && month.amount === 0)).toBe(true);
});
