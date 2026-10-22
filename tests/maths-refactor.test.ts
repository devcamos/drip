import { describe, expect, it } from "vitest";
import { accrue, applySetBalance, applyTopUp, applyWithdraw, momBreakdown, momGrowth, rateOn } from "../lib/maths";

describe("maths refactor keeps behaviour", () => {
  it("accrue uses the right rate for unsorted rate history", () => {
    const unsorted = [{ from: "2026-01-10", ratePct: 3.65 }, { from: "2026-01-01", ratePct: 0 }];
    const r = accrue(1000, unsorted, [], "2026-01-01", "2026-01-11");
    // First 9 days at 0%, last day at 3.65% (0.01% a day).
    expect(r.interest).toBeCloseTo(0.1, 6);
    expect(rateOn(unsorted, "2026-01-05")).toBe(0);
    expect(rateOn([], "2026-01-05")).toBe(0);
  });

  it("momGrowth and momBreakdown share the same history rules", () => {
    expect(momGrowth([])).toBeNull();
    expect(momBreakdown([{ month: "2026-01", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-02", totalBalance: 10, monthlyIncome: 0 }])).toBeNull();
    const snaps = [
      { month: "2026-02", totalBalance: 1200, monthlyIncome: 0, deposits: 150, withdrawals: 0 },
      { month: "2026-01", totalBalance: 1000, monthlyIncome: 0 },
    ];
    expect(momGrowth(snaps)).toBeCloseTo(20);
    expect(momBreakdown(snaps)).toEqual({ change: 200, deposits: 150, withdrawals: 0, growth: 50, growthPct: 5 });
  });

  it("balance helpers append rounded events without mutating", () => {
    const a: { balance: number; events?: { type: "topup" | "withdraw" | "set" | "interest"; date: string; amount: number }[] } = { balance: 100 };
    const up = applyTopUp(a, 10.005, "2026-01-01");
    expect(up.events).toEqual([{ type: "topup", date: "2026-01-01", amount: 10.01 }]);
    expect(applyWithdraw(up, 5, "2026-01-02").balance).toBe(105.01);
    expect(applySetBalance(up, 50, "2026-01-03").events?.at(-1)).toEqual({ type: "set", date: "2026-01-03", amount: 50 });
    expect(a.events).toBeUndefined();
  });
});
