import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentCalendar } from "../lib/payment-calendar";
import { payoutAmount, recordedIncome, round2 } from "../lib/maths";
import { calendarAccount as account } from "./payment-calendar-fixtures";

// Pure domain tests. No React, IndexedDB, crypto, HTTP, files or real clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("payment calendar — unit (14 cases)", () => {
  it("projects twelve monthly payments from tomorrow using the entered balance and yield", () => {
    const result = paymentCalendar([account({ balance: 3000, ratePct: 7 })], "2026-10-31")!;
    expect(result.from).toBe("2026-11-01");
    expect(result.through).toBe("2027-10-31");
    expect(result.months).toHaveLength(12);
    const monthly = round2(payoutAmount(account({ balance: 3000, ratePct: 7 }), "2026-11-01"));
    expect(result.months.every(month => month.count === 1 && month.amount === monthly)).toBe(true);
    expect(result.months.flatMap(month => month.payments).map(row => row.date)).toEqual([
      "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15",
      "2027-05-15", "2027-06-15", "2027-07-15", "2027-08-15", "2027-09-15", "2027-10-15",
    ]);
  });

  it("bounds a partial-month window, excluding today and the day after its inclusive end", () => {
    const result = paymentCalendar([
      account({ nextPayoutDate: "2026-11-15" }),
      account({ id: "outside", frequency: "annually", nextPayoutDate: "2027-11-16" }),
    ], "2026-11-15")!;
    expect(result.from).toBe("2026-11-16");
    expect(result.through).toBe("2027-11-15");
    expect(result.months).toHaveLength(13);
    const rows = result.months.flatMap(month => month.payments);
    expect(rows).toHaveLength(12);
    expect(rows[0].date).toBe("2026-12-15");
    expect(rows.at(-1)!.date).toBe("2027-11-15");
    expect(rows.every(row => row.account.id !== "outside")).toBe(true);
  });

  it("catches up old quarterly anchors and preserves month-end across years", () => {
    const result = paymentCalendar([account({ frequency: "quarterly", nextPayoutDate: "2026-01-31" })], "2026-10-30")!;
    expect(result.months.flatMap(month => month.payments).map(row => row.date)).toEqual([
      "2026-10-31", "2027-01-31", "2027-04-30", "2027-07-31",
    ]);
    const quarterly = round2(payoutAmount(account({ frequency: "quarterly", nextPayoutDate: "2026-01-31" }), "2026-10-31"));
    expect(result.months.flatMap(month => month.payments).every(row => row.amount === quarterly)).toBe(true);
  });

  it("restores a yearly leap-day anchor when the next leap year arrives", () => {
    const schedule = account({ frequency: "annually", nextPayoutDate: "2024-02-29" });
    const nonLeap = paymentCalendar([schedule], "2025-02-01")!;
    const leap = paymentCalendar([schedule], "2027-03-01")!;
    expect(nonLeap.months.flatMap(month => month.payments).map(row => row.date)).toEqual(["2025-02-28"]);
    expect(leap.months.flatMap(month => month.payments).map(row => row.date)).toEqual(["2028-02-29"]);
    expect(leap.months.flatMap(month => month.payments)[0].amount).toBe(round2(payoutAmount(schedule, "2027-03-02")));
  });

  it("returns to the original monthly anchor after February clamps the date", () => {
    const result = paymentCalendar([account({ nextPayoutDate: "2027-01-31" })], "2027-01-30")!;
    expect(result.months.flatMap(month => month.payments).slice(0, 4).map(row => row.date)).toEqual([
      "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30",
    ]);
  });

  it("groups daily payments by actual calendar days through a leap year", () => {
    const daily = account({ frequency: "daily", rateType: "interest", balance: 3650, ratePct: 1 });
    const result = paymentCalendar([daily], "2028-01-31")!;
    expect(result.months).toHaveLength(12);
    expect(result.months[0].payments).toHaveLength(1);
    const febDaily = payoutAmount(daily, "2028-02-01");
    expect(result.months[0].payments[0]).toMatchObject({ date: "2028-02-01", through: "2028-02-29", occurrences: 29, amount: round2(febDaily * 29) });
    expect(result.months.reduce((sum, month) => sum + month.count, 0)).toBe(366);
    expect(result.months.reduce((sum, month) => sum + month.amount, 0)).toBeCloseTo(febDaily * 366, 1);
  });

  it("starts daily accrual on a future creation date without charging for earlier days", () => {
    const daily = account({ frequency: "daily", balance: 3650, ratePct: 1, createdAt: "2026-11-10", nextPayoutDate: "2026-01-01" });
    const result = paymentCalendar([daily], "2026-10-31")!;
    expect(result.months[0].payments[0]).toMatchObject({ date: "2026-11-10", through: "2026-11-30", occurrences: 21, amount: round2(payoutAmount(daily, "2026-11-01") * 21) });
    expect(result.months.reduce((sum, month) => sum + month.count, 0)).toBe(356);
  });

  it("rejects an impossible reference date instead of normalizing it silently", () => {
    expect(paymentCalendar([account()], "2026-02-30")).toBeNull();
  });

  it("rejects a rolling window beyond the supported date range", () => {
    expect(paymentCalendar([account()], "9999-12-31")).toBeNull();
  });

  it("omits non-earning, invalid-date and non-finite schedules", () => {
    const result = paymentCalendar([
      account({ id: "valid" }), account({ balance: 0 }), account({ balance: -1 }),
      account({ ratePct: 0 }), account({ ratePct: -1 }), account({ nextPayoutDate: "invalid" }),
      account({ balance: Infinity }), account({ ratePct: NaN }),
    ], "2026-10-31")!;
    expect(result.months.flatMap(month => month.payments)).toHaveLength(12);
    expect(result.months.every(month => month.payments.length === 1 && month.payments[0].account.id === "valid")).toBe(true);
  });

  it("returns an explicit empty year for a user without earning accounts", () => {
    const result = paymentCalendar([], "2026-10-31")!;
    expect(result.months).toHaveLength(12);
    expect(result.months.every(month => month.count === 0 && month.amount === 0 && month.payments.length === 0)).toBe(true);
  });

  it("sorts rows by date and account ID and totals the displayed penny-rounded amounts", () => {
    const result = paymentCalendar([
      account({ id: "z", balance: 1000, ratePct: 4, nextPayoutDate: "2026-11-16" }),
      account({ id: "b", balance: 1000, ratePct: 4 }),
      account({ id: "a", balance: 1000, ratePct: 4 }),
    ], "2026-10-31")!;
    expect(result.months[0].payments.map(row => row.account.id)).toEqual(["a", "b", "z"]);
    const each = round2(payoutAmount(account({ id: "a", balance: 1000, ratePct: 4 }), "2026-11-01"));
    expect(result.months[0].payments.map(row => row.amount)).toEqual([each, each, each]);
    expect(result.months[0].amount).toBe(round2(each * 3));
    expect(result.months[0].count).toBe(3);
  });

  it("recalculates edited dates and frequency without adding bonuses or compounding", () => {
    const original = account({ bonus: { amount: 999, expectedDate: "2026-11-20" }, reinvestIncome: true });
    const before = paymentCalendar([original], "2026-10-31")!;
    const updated = paymentCalendar([{ ...original, nextPayoutDate: "2026-11-20", frequency: "quarterly" }], "2026-10-31")!;
    const monthly = round2(payoutAmount(original, "2026-11-01"));
    const quarterly = round2(payoutAmount({ ...original, frequency: "quarterly" }, "2026-11-01"));
    expect(before.months[0].amount).toBe(monthly);
    const rows = updated.months.flatMap(month => month.payments);
    expect(rows.map(row => row.date)).toEqual(["2026-11-20", "2027-02-20", "2027-05-20", "2027-08-20"]);
    expect(rows.map(row => row.amount)).toEqual([quarterly, quarterly, quarterly, quarterly]);
    expect(updated.months[1].payments).toEqual([]);
  });

  it("never mutates frozen account records, payment history or received-income totals", () => {
    const accounts = [account({ payouts: [{ date: "2026-10-01", amount: 12.5, kind: "actual" }], events: [{ type: "topup", date: "2026-10-02", amount: 200 }] })];
    const before = structuredClone(accounts);
    Object.freeze(accounts[0].payouts[0]); Object.freeze(accounts[0].payouts);
    Object.freeze(accounts[0].events![0]); Object.freeze(accounts[0].events);
    Object.freeze(accounts[0]); Object.freeze(accounts);
    paymentCalendar(accounts, "2026-10-31");
    expect(accounts).toEqual(before);
    expect(recordedIncome(accounts, undefined, "2026-10-31")).toBe(12.5);
  });
});
