import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";

describe("top-ups", () => {
  it("mid-period top-up: old balance before, new balance after, compounding continues", () => {
    // £3,000 at 7.3% (0.02%/day). 30-day period, £1,000 top-up on day 10.
    const r = M.periodGrowth(3000, 7.3, [{ date: "2026-10-11", amount: 1000 }], "2026-10-01", "2026-10-31");
    const daily = 0.073 / 365;
    const expected = (3000 * Math.pow(1 + daily, 10) + 1000) * Math.pow(1 + daily, 20);
    expect(r.closing).toBeCloseTo(expected, 8);
    expect(r.deposits).toBe(1000);
    expect(r.interest).toBeCloseTo(expected - 4000, 8);
    // less interest than if the £1,000 had been there all month, more than if never added
    expect(r.interest).toBeLessThan(M.periodGrowth(4000, 7.3, [], "2026-10-01", "2026-10-31").interest);
    expect(r.interest).toBeGreaterThan(M.periodGrowth(3000, 7.3, [], "2026-10-01", "2026-10-31").interest);
  });
  it("ignores top-ups outside the period, zero/negative ones, and handles zero rate", () => {
    const r = M.periodGrowth(1000, 0, [{ date: "2026-09-30", amount: 50 }, { date: "2026-10-31", amount: 50 }, { date: "2026-10-05", amount: -5 }, { date: "2026-10-05", amount: 20 }], "2026-10-01", "2026-10-31");
    expect(r).toEqual({ opening: 1000, deposits: 20, interest: 0, closing: 1020 });
    expect(M.periodGrowth(-5, 5, [], "2026-10-01", "2026-10-02").opening).toBe(0);
  });
  it("applyTopUp / applySetBalance update balance and log events", () => {
    let a = { balance: 3000, events: undefined as any };
    a = M.applyTopUp(a, 250.555, "2026-10-15");
    expect(a.balance).toBe(3250.56);
    a = M.applySetBalance(a, 3300, "2026-10-20");
    expect(a.balance).toBe(3300);
    expect(a.events).toEqual([{ type: "topup", date: "2026-10-15", amount: 250.56 }, { type: "set", date: "2026-10-20", amount: 3300 }]);
    expect(() => M.applyTopUp(a, 0, "2026-10-15")).toThrow();
    expect(() => M.applySetBalance(a, -1, "2026-10-15")).toThrow();
  });
  it("month-on-month splits top-ups from growth", () => {
    const accts = [{ events: [{ type: "topup" as const, date: "2026-10-11", amount: 1000 }, { type: "set" as const, date: "2026-10-12", amount: 9 }] }, {}];
    expect(M.depositsInMonth(accts, "2026-10")).toBe(1000);
    expect(M.depositsInMonth(accts, "2026-09")).toBe(0);
    const b = M.momBreakdown([{ month: "2026-09", totalBalance: 3000, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 4017.5, monthlyIncome: 0, deposits: 1000 }])!;
    expect(b.change).toBeCloseTo(1017.5); expect(b.deposits).toBe(1000); expect(b.growth).toBeCloseTo(17.5); expect(b.growthPct).toBeCloseTo(17.5 / 30);
    expect(M.momBreakdown([{ month: "2026-09", totalBalance: 3000, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 3010, monthlyIncome: 0 }])!.deposits).toBe(0);
    expect(M.momBreakdown([])).toBeNull();
    expect(M.momBreakdown([{ month: "2026-09", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 1, monthlyIncome: 0 }])).toBeNull();
  });
});
