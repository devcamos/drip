import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";
import type { Account } from "../lib/types";
import { pence } from "./money-fixtures";

const acct = (o: Partial<Account>): Account => ({
  id: "x", provider: "Zopa", label: "", balance: pence(3000), currency: "GBP", ratePct: 7, rateType: "interest", frequency: "monthly",
  nextPayoutDate: "2026-10-28", colour: "#000", payouts: [], createdAt: "2026-10-01", ...o,
});

describe("maths", () => {
  it("monthly income = balance × rate ÷ 12 (spec example)", () => {
    expect(M.monthlyIncome(pence(3000), 7)).toBeCloseTo(pence(17.5), 10);
    expect(M.monthlyIncome(pence(3000), 4)).toBeCloseTo(pence(10), 10);
    expect(M.monthlyIncome(0, 7)).toBe(0);
    expect(M.monthlyIncome(-5, 7)).toBe(0);
    expect(M.monthlyIncome(100, 0)).toBe(0);
    expect(M.monthlyIncome(NaN, 5)).toBe(0);
  });
  it("payout amount by frequency", () => {
    expect(M.payoutAmount(acct({}))).toBeCloseTo(pence(17.5));
    expect(M.payoutAmount(acct({ frequency: "quarterly" }))).toBeCloseTo(pence(52.5));
    expect(M.payoutAmount(acct({ frequency: "annually" }))).toBeCloseTo(pence(210));
  });
  it("totals and weighted yield", () => {
    const a = [acct({ balance: pence(3000), ratePct: 7 }), acct({ balance: pence(1000), ratePct: 3 })];
    expect(M.totalBalance(a)).toBe(pence(4000));
    expect(M.totalMonthlyIncome(a)).toBeCloseTo(pence(17.5) + pence(2.5));
    expect(M.weightedYield(a)).toBeCloseTo(6);
    expect(M.weightedYield([])).toBe(0);
    expect(M.totalBalance([acct({ balance: -10 })])).toBe(0);
    expect(M.weightedYield([acct({ balance: pence(100), ratePct: -2 }), acct({ balance: -100, ratePct: 5 })])).toBe(0);
  });
  it("month-on-month growth", () => {
    expect(M.momGrowth([])).toBeNull();
    expect(M.momGrowth([{ month: "2026-09", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 5, monthlyIncome: 0 }])).toBeNull();
    expect(M.momGrowth([
      { month: "2026-10", totalBalance: pence(1100), monthlyIncome: 0 },
      { month: "2026-09", totalBalance: pence(1000), monthlyIncome: 0 },
    ])).toBeCloseTo(10);
  });
  it("12-month projection compounds monthly", () => {
    const p = M.projection([acct({ balance: pence(1200), ratePct: 12 }), acct({ balance: -1 })]);
    expect(p).toHaveLength(12);
    expect(p[0].balance).toBeCloseTo(pence(1212));
    expect(p[11].balance).toBeCloseTo(pence(1200) * Math.pow(1.01, 12));
    expect(M.projection([acct({ ratePct: -3, balance: pence(100) })], 1)[0].balance).toBe(pence(100));
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
    expect(u[0].amount).toBeCloseTo(pence(17.5));
  });
  it("snapshot upsert replaces the current month", () => {
    const now = new Date(Date.UTC(2026, 9, 15));
    let s = M.upsertSnapshot([{ month: "2026-09", totalBalance: 1, monthlyIncome: 0 }], [acct({})], now);
    s = M.upsertSnapshot(s, [acct({ balance: pence(4000) })], now);
    expect(s).toEqual([{ month: "2026-09", totalBalance: 1, monthlyIncome: 0 }, { month: "2026-10", totalBalance: pence(4000), monthlyIncome: Math.round(pence(4000) * 7 / 100 / 12), deposits: 0, withdrawals: 0 }]);
  });
  it("backup reminder", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(M.backupDue(null, false, now)).toBe(false);
    expect(M.backupDue(null, true, now)).toBe(true);
    expect(M.backupDue("2026-10-10T00:00:00Z", true, now)).toBe(false);
    expect(M.backupDue("2026-09-01T00:00:00Z", true, now)).toBe(true);
  });
  it("formats GBP from pence and rounds legacy floats", () => {
    expect(M.gbp(pence(17.5))).toBe("£17.50");
    expect(M.round2(1.005)).toBe(1.01);
  });
});
