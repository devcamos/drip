import { afterEach, describe, it, expect, vi } from "vitest";
import * as M from "../lib/maths";
import type { Account } from "../lib/types";

const acct = (o: Partial<Account>): Account => ({
  id: "x", provider: "Zopa", label: "", balance: 3000, ratePct: 7, rateType: "interest", frequency: "monthly",
  nextPayoutDate: "2026-10-28", colour: "#000", payouts: [], createdAt: "2026-10-01", ...o,
});

describe("maths", () => {
  it("monthly income is that calendar month compounded daily at the AER", () => {
    const october = "2026-10-15";
    expect(M.monthlyIncome(3000, 7, october)).toBeCloseTo(M.accrue(3000, 7, [], "2026-10-01", "2026-11-01").interest, 10);
    expect(M.monthlyIncome(3000, 4, october)).toBeCloseTo(M.accrue(3000, 4, [], "2026-10-01", "2026-11-01").interest, 10);
    expect(M.monthlyIncome(0, 7, october)).toBe(0);
    expect(M.monthlyIncome(-5, 7, october)).toBe(0);
    expect(M.monthlyIncome(100, 0, october)).toBe(0);
    expect(M.monthlyIncome(NaN, 5, october)).toBe(0);
  });
  it("payout amount compounds daily at the AER over the payment period", () => {
    const today = "2026-10-15";
    expect(M.payoutAmount(acct({}), today)).toBeCloseTo(M.monthlyIncome(3000, 7, today), 10);
    expect(M.payoutAmount(acct({ frequency: "quarterly" }), today)).toBeCloseTo(M.accrue(3000, 7, [], today, "2027-01-15").interest, 10);
    expect(M.payoutAmount(acct({ frequency: "annually" }), today)).toBeCloseTo(M.accrue(3000, 7, [], today, "2027-10-15").interest, 10);
    expect(M.payoutAmount(acct({ frequency: "annually" }), today)).toBeCloseTo(210, 2);
    expect(M.payoutAmount(acct({ frequency: "daily" }), today)).toBeCloseTo(3000 * M.dailyRate(7, today), 10);
  });
  it("totals and weighted yield", () => {
    const today = "2026-10-15";
    const a = [acct({ balance: 3000, ratePct: 7 }), acct({ balance: 1000, ratePct: 3 })];
    expect(M.totalBalance(a)).toBe(4000);
    expect(M.totalMonthlyIncome(a, today)).toBeCloseTo(M.monthlyIncome(3000, 7, today) + M.monthlyIncome(1000, 3, today), 10);
    expect(M.weightedYield(a)).toBeCloseTo(6);
    expect(M.weightedYield([])).toBe(0);
    expect(M.totalBalance([acct({ balance: -10 })])).toBe(0);
    expect(M.weightedYield([acct({ balance: 100, ratePct: -2 }), acct({ balance: -100, ratePct: 5 })])).toBe(0);
  });
  it("month-on-month growth", () => {
    expect(M.momGrowth([])).toBeNull();
    expect(M.momGrowth([{ month: "2026-09", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 5, monthlyIncome: 0 }])).toBeNull();
    expect(M.momGrowth([
      { month: "2026-10", totalBalance: 1100, monthlyIncome: 0 },
      { month: "2026-09", totalBalance: 1000, monthlyIncome: 0 },
    ])).toBeCloseTo(10);
  });
  it("12-month reinvested projection compounds daily to exactly the annual rate (AER)", () => {
    const p = M.projection([acct({ balance: 1200, ratePct: 12 }), acct({ balance: -1 })], 12, 0, "2026-01-01");
    expect(p).toHaveLength(12);
    expect(p[0].balance).toBeCloseTo(1200 * Math.pow(1.12, 31 / 365));
    expect(p[11].balance).toBeCloseTo(1344);
    expect(p[11].income).toBeCloseTo(144);
    expect(M.projection([acct({ ratePct: -3, balance: 100 })], 1, 0, "2026-01-01")[0].balance).toBe(100);
  });
  it("date helpers clamp month ends and roll forward", () => {
    expect(M.addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(M.addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(M.addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(M.nextPayout("2026-10-28", "monthly", "2026-10-15")).toBe("2026-10-28");
    expect(M.nextPayout("2026-08-28", "monthly", "2026-10-15")).toBe("2026-10-28");
    expect(M.nextPayout("2026-01-31", "monthly", "2026-02-15")).toBe("2026-02-28");
    expect(M.nextPayout("2026-01-31", "monthly", "2026-03-01")).toBe("2026-03-31");
    expect(M.nextPayout("2026-01-10", "quarterly", "2026-05-01")).toBe("2026-07-10");
    expect(M.nextPayout("2025-06-01", "annually", "2026-10-15")).toBe("2027-06-01");
    expect(M.monthKey(new Date(Date.UTC(2026, 9, 15)))).toBe("2026-10");
  });
  it("upcoming payouts in window, sorted", () => {
    const a = [acct({ id: "a", nextPayoutDate: "2026-10-28" }), acct({ id: "b", nextPayoutDate: "2026-10-20" }), acct({ id: "c", nextPayoutDate: "2027-01-01", frequency: "annually" })];
    const u = M.upcoming(a, "2026-10-15");
    expect(u.map((x) => x.account.id)).toEqual(["b", "a"]);
    expect(u[0].amount).toBeCloseTo(M.payoutAmount(a[1], "2026-10-15"), 10);
  });
  it("snapshot upsert replaces the current month", () => {
    const now = new Date(Date.UTC(2026, 9, 15));
    let s = M.upsertSnapshot([{ month: "2026-09", totalBalance: 1, monthlyIncome: 0 }], [acct({})], now);
    s = M.upsertSnapshot(s, [acct({ balance: 4000 })], now);
    expect(s).toEqual([{ month: "2026-09", totalBalance: 1, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 4000, monthlyIncome: M.round2(M.monthlyIncome(4000, 7, "2026-10-15")), deposits: 0, withdrawals: 0 }]);
  });
  it("backup reminder", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(M.backupDue(null, false, now)).toBe(false);
    expect(M.backupDue(null, true, now)).toBe(true);
    expect(M.backupDue("2026-10-10T00:00:00Z", true, now)).toBe(false);
    expect(M.backupDue("2026-09-01T00:00:00Z", true, now)).toBe(true);
  });
  it("formats GBP and rounds", () => {
    expect(M.gbp(17.5)).toBe("£17.50");
    expect(M.round2(1.005)).toBe(1.01);
  });
});

describe("round2 rounds half-pennies up (#79)", () => {
  it("rounds 2.135 to 2.14 and every half-penny from £0.005 to £1,000.005 up", () => {
    expect(M.round2(2.135)).toBe(2.14);
    expect(M.round2(4.015)).toBe(4.02);
    expect(M.round2(1.005)).toBe(1.01);
    expect(M.round2(1234.565)).toBe(1234.57);
    const wrong: string[] = [];
    for (let pennies = 0; pennies < 100_000; pennies++) {
      const text = (pennies / 100).toFixed(2) + "5";
      if (M.round2(Number(text)).toFixed(2) !== ((pennies + 1) / 100).toFixed(2)) wrong.push(text);
    }
    expect(wrong).toEqual([]);
  });
  it("leaves exact pennies and ordinary sums unchanged", () => {
    expect(M.round2(0.1 + 0.2)).toBe(0.3);
    expect(M.round2(19.99)).toBe(19.99);
    expect(M.round2(0)).toBe(0);
    expect(M.round2(1e9 + 0.01)).toBe(1e9 + 0.01);
  });
});

describe("today follows the UK calendar (#78)", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("uses the UK date during British Summer Time and GMT", () => {
    expect(M.localToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(M.localToday(new Date("2026-06-30T22:59:59Z"))).toBe("2026-06-30");
    expect(M.localToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
    expect(M.localToday(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
    expect(M.monthKey(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08");
  });
  it("accepts a top-up dated today at 00:30 BST and files it in the UK month", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-30T23:30:00Z"));
    const a = M.applyTopUp(acct({ balance: 100, events: [] }), 5, "2026-07-01");
    expect(a.events).toEqual([{ type: "topup", date: "2026-07-01", amount: 5 }]);
    expect(() => M.applyTopUp(a, 5, "2026-07-02")).toThrow(/today or a past date/);
    const snaps = M.upsertSnapshot([], [a], new Date());
    expect(snaps).toEqual([expect.objectContaining({ month: "2026-07", deposits: 5 })]);
    expect(M.recordedIncome([acct({ payouts: [{ date: "2026-07-01", amount: 3, kind: "actual", incomeType: "interest" }] })])).toBe(3);
  });
});

describe("day-accurate current-period interest", () => {
  it("reconstructs the opening balance by reversing later top-ups and withdrawals", () => {
    const a = acct({
      balance: 2300,
      events: [
        { type: "topup", date: "2026-11-10", amount: 500 },
        { type: "withdraw", date: "2026-11-20", amount: 200 },
        { type: "set", date: "2026-11-25", amount: 2300 },
      ],
    });
    expect(M.confirmedBalanceOn(a, "2026-11-01")).toBe(2000);
    expect(M.confirmedBalanceOn(a, "2026-11-10")).toBe(2000);
    expect(M.confirmedBalanceOn(a, "2026-11-11")).toBe(2500);
    expect(M.confirmedBalanceOn(a, "2026-11-21")).toBe(2300);
  });

  it("anchors the opening balance on manual balance updates and accrues from each update", () => {
    // Updated to £1,500 on 31 Oct, then to £5,000 on 20 Nov, at 5%.
    const a = acct({ balance: 5000, ratePct: 5, createdAt: "2026-01-01", rateHistory: [{ from: "2026-01-01", ratePct: 5 }],
      events: [{ type: "set", date: "2026-10-31", amount: 1500 }, { type: "set", date: "2026-11-20", amount: 5000 }] });
    expect(M.confirmedBalanceOn(a, "2026-11-01")).toBe(1500);
    expect(M.confirmedBalanceOn(a, "2026-11-20")).toBe(1500);
    expect(M.confirmedBalanceOn(a, "2026-11-21")).toBe(5000);
    const daily = M.dailyRate(5, "2026-11-01");
    const expected = 1500 * ((1 + daily) ** 19 - 1) + 5000 * ((1 + daily) ** 11 - 1);
    expect(M.currentPeriodInterest(a, "2026-11-25")).toBeCloseTo(expected, 10);
    // Transfers after an earlier update replay forward; a later update caps the reverse walk.
    const mixed = acct({ balance: 900, events: [
      { type: "set", date: "2026-10-20", amount: 1000 }, { type: "topup", date: "2026-10-25", amount: 200 },
      { type: "withdraw", date: "2026-11-05", amount: 100 }, { type: "set", date: "2026-11-10", amount: 1050 }, { type: "withdraw", date: "2026-11-12", amount: 150 },
    ] });
    expect(M.confirmedBalanceOn(mixed, "2026-11-01")).toBe(1200);
    expect(M.confirmedBalanceOn(mixed, "2026-10-01")).toBe(1000);
    expect(M.confirmedBalanceOn(mixed, "2026-11-11")).toBe(1050);
    expect(M.confirmedBalanceOn(mixed, "2026-12-01")).toBe(900);
    expect(M.confirmedBalanceOn(acct({ balance: 0, events: [{ type: "set", date: "2026-10-01", amount: 10 }, { type: "withdraw", date: "2026-10-02", amount: 50 }] }), "2026-11-01")).toBe(0);
  });

  it("starts accruing on the day the account was added, not the 1st of the month", () => {
    const added = acct({ balance: 1000, ratePct: 5, createdAt: "2026-11-10T09:30:00.000Z", rateHistory: [{ from: "2026-11-10", ratePct: 5 }], events: [] });
    const expected = 1000 * ((1 + M.dailyRate(5, "2026-11-10")) ** 21 - 1);
    expect(M.currentPeriodInterest(added, "2026-11-15")).toBeCloseTo(expected, 10);
    expect(M.expectedInterest(added, "2026-10-01", "2026-11-01")).toBe(0);
    expect(M.expectedInterest({ ...added, createdAt: "legacy" }, "2026-11-01", "2026-12-01")).toBeCloseTo(1000 * ((1 + M.dailyRate(5, "2026-11-01")) ** 30 - 1), 10);
  });

  it("uses accrue() for interest accounts in the current calendar month", () => {
    const a = acct({
      balance: 3500,
      ratePct: 7,
      rateHistory: [{ from: "2026-01-01", ratePct: 7 }],
      events: [{ type: "topup", date: "2026-11-10", amount: 500 }],
    });
    const expected = M.accrue(3000, 7, [{ type: "topup", date: "2026-11-10", amount: 500 }], "2026-11-01", "2026-12-01").interest;
    expect(M.expectedInterest(a, "2026-11-01", "2026-12-01")).toBeCloseTo(expected, 10);
    expect(M.currentPeriodInterest(a, "2026-11-15")).toBeCloseTo(expected, 10);
    expect(M.currentPeriodInterest(a, "2026-11-15")).not.toBeCloseTo(M.accountMonthlyIncome(a), 2);
    expect(M.totalCurrentPeriodInterest([a, acct({ id: "b", balance: 0 })], "2026-11-15")).toBeCloseTo(expected, 10);
  });

  it("follows mid-month rate changes, and skips credit, archived and dividend-average cases", () => {
    const changing = acct({
      balance: 1000,
      ratePct: 10,
      rateHistory: [{ from: "2026-01-01", ratePct: 5 }, { from: "2026-11-16", ratePct: 10 }],
    });
    expect(M.expectedInterest(changing, "2026-11-01", "2026-12-01")).toBeCloseTo(
      M.accrue(1000, changing.rateHistory!, [], "2026-11-01", "2026-12-01").interest,
      10,
    );
    expect(M.currentPeriodInterest(acct({ productCategory: "credit-card", creditCard: { apr: 19.9, minimumPayment: 25 } as Account["creditCard"], ratePct: 0 }), "2026-11-15")).toBe(0);
    expect(M.currentPeriodInterest(acct({ archivedAt: "2026-10-01T00:00:00Z" }), "2026-11-15")).toBe(0);
    const dividend = acct({ rateType: "dividend", balance: 1200, ratePct: 6 });
    expect(M.currentPeriodInterest(dividend, "2026-11-15")).toBeCloseTo(M.accountMonthlyIncome(dividend, "2026-11-15"), 10);
  });
});

describe("annual equivalent rate (AER) is not compounded twice (#77)", () => {
  it("a full calendar year at a constant rate earns exactly that rate, in normal and leap years", () => {
    expect(M.accrue(1000, 5, [], "2026-01-01", "2027-01-01").interest).toBeCloseTo(50, 2);
    expect(M.accrue(1000, 5, [], "2028-01-01", "2029-01-01").interest).toBeCloseTo(50, 2);
    expect(M.accrue(1000, 5, [], "2026-07-01", "2027-07-01").interest).toBeCloseTo(50, 2);
  });
  it("converts annual to daily by days in that year and ignores zero or negative rates", () => {
    expect(Math.pow(1 + M.dailyRate(5, "2026-06-15"), 365)).toBeCloseTo(1.05, 12);
    expect(Math.pow(1 + M.dailyRate(5, "2028-06-15"), 366)).toBeCloseTo(1.05, 12);
    expect(M.dailyRate(5, "1900-01-01")).toBe(M.dailyRate(5, "2026-01-01"));
    expect(M.dailyRate(5, "2000-01-01")).toBe(M.dailyRate(5, "2028-01-01"));
    expect(M.daysInYear("1900-01-01")).toBe(365);
    expect(M.daysInYear("2000-01-01")).toBe(366);
    expect(M.dailyRate(0, "2026-01-01")).toBe(0);
    expect(M.dailyRate(-1, "2026-01-01")).toBe(0);
  });
  it("a 12-month reinvested projection of £1,000 at 5% earns £50.00", () => {
    const forecast = M.projection([acct({ balance: 1000, ratePct: 5 })], 12, 0, "2026-01-01").at(-1)!;
    expect(forecast.income).toBeCloseTo(50, 2);
    expect(forecast.balance).toBeCloseTo(1050, 2);
    const leap = M.projection([acct({ balance: 1000, ratePct: 5 })], 12, 0, "2028-01-01").at(-1)!;
    expect(leap.income).toBeCloseTo(50, 2);
    expect(M.annualIncome(1000, 5, "2026-01-01")).toBeCloseTo(50, 2);
    expect(M.annualIncome(0, 5, "2026-01-01")).toBe(0);
    expect(M.annualIncome(100, 0, "2026-01-01")).toBe(0);
  });
});
