import { describe, expect, it } from "vitest";
import { accrue, applySetBalance, applyTopUp, applyWithdraw, momBreakdown, momGrowth, rateOn, toPence } from "../lib/maths";
import { pence } from "./money-fixtures";

describe("maths refactor keeps behaviour", () => {
  it("accrue uses the right rate for unsorted rate history", () => {
    const unsorted = [{ from: "2026-01-10", ratePct: 3.65 }, { from: "2026-01-01", ratePct: 0 }];
    const r = accrue(pence(1000), unsorted, [], "2026-01-01", "2026-01-11");
    // First 9 days at 0%, last day at 3.65% → 1p credited with remainder carry.
    expect(r.interest).toBe(r.closing - pence(1000));
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(rateOn(unsorted, "2026-01-05")).toBe(0);
    expect(rateOn([], "2026-01-05")).toBe(0);
  });

  it("momGrowth and momBreakdown share the same history rules", () => {
    expect(momGrowth([])).toBeNull();
    expect(momBreakdown([{ month: "2026-01", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-02", totalBalance: 10, monthlyIncome: 0 }])).toBeNull();
    const snaps = [
      { month: "2026-02", totalBalance: pence(1200), monthlyIncome: 0, deposits: pence(150), withdrawals: 0 },
      { month: "2026-01", totalBalance: pence(1000), monthlyIncome: 0 },
    ];
    expect(momGrowth(snaps)).toBeCloseTo(20);
    expect(momBreakdown(snaps)).toEqual({ change: pence(200), deposits: pence(150), withdrawals: 0, growth: pence(50), growthPct: 5 });
  });

  it("balance helpers append pence events without mutating", () => {
    const a: { balance: number; currency?: "GBP"; events?: { id?: string; type: "topup" | "withdraw" | "set" | "interest"; date: string; amount: number }[] } = { balance: pence(100), currency: "GBP" };
    const up = applyTopUp(a, toPence(10.005), "2026-01-01");
    expect(up.events).toEqual([{ id: expect.any(String), type: "topup", date: "2026-01-01", amount: pence(10.01) }]);
    expect(applyWithdraw(up, pence(5), "2026-01-02").balance).toBe(pence(105.01));
    expect(applySetBalance(up, pence(50), "2026-01-03").events?.at(-1)).toEqual({ id: expect.any(String), type: "set", date: "2026-01-03", amount: pence(50) });
    expect(a.events).toBeUndefined();
  });
});
