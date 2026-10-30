import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";
import { pence } from "./money-fixtures";

describe("top-ups", () => {
  it("mid-period top-up: old balance before, new balance after, compounding continues", () => {
    // £3,000 at 7.3%. 30-day period, £1,000 top-up on day 10. Amounts in pence.
    const r = M.periodGrowth(pence(3000), 7.3, [{ date: "2026-10-11", amount: pence(1000) }], "2026-10-01", "2026-10-31");
    expect(r.deposits).toBe(pence(1000));
    expect(r.interest).toBe(r.closing - pence(3000) - pence(1000));
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(r.interest).toBeLessThan(M.periodGrowth(pence(4000), 7.3, [], "2026-10-01", "2026-10-31").interest);
    expect(r.interest).toBeGreaterThan(M.periodGrowth(pence(3000), 7.3, [], "2026-10-01", "2026-10-31").interest);
  });
  it("ignores top-ups outside the period, zero/negative ones, and handles zero rate", () => {
    const r = M.periodGrowth(pence(1000), 0, [{ date: "2026-09-30", amount: pence(50) }, { date: "2026-10-31", amount: pence(50) }, { date: "2026-10-05", amount: -5 }, { date: "2026-10-05", amount: pence(20) }], "2026-10-01", "2026-10-31");
    expect(r).toMatchObject({ opening: pence(1000), deposits: pence(20), withdrawals: 0, interest: 0, closing: pence(1020) });
    expect(M.periodGrowth(-5, 5, [], "2026-10-01", "2026-10-02").opening).toBe(0);
  });
  it("applyTopUp / applySetBalance update balance and log events", () => {
    let a = { balance: pence(3000), currency: "GBP" as const, events: undefined as undefined };
    a = M.applyTopUp(a, M.toPence(250.555), "2026-10-15");
    expect(a.balance).toBe(pence(3250.56));
    a = M.applySetBalance(a, pence(3300), "2026-10-20");
    expect(a.balance).toBe(pence(3300));
    expect(a.events).toEqual([
      { id: expect.any(String), type: "topup", date: "2026-10-15", amount: pence(250.56) },
      { id: expect.any(String), type: "set", date: "2026-10-20", amount: pence(3300) },
    ]);
    expect(() => M.applyTopUp(a, 0, "2026-10-15")).toThrow();
    expect(() => M.applySetBalance(a, -1, "2026-10-15")).toThrow();
  });
  it("0.1+0.2-style top-ups are exact in pence", () => {
    let a = { balance: 0, currency: "GBP" as const, events: [] as { id?: string; type: "topup"; date: string; amount: number }[] };
    a = M.applyTopUp(a, M.toPence(0.1), "2026-10-01");
    a = M.applyTopUp(a, M.toPence(0.2), "2026-10-02");
    expect(a.balance).toBe(30);
    expect(M.toPence(0.1) + M.toPence(0.2)).toBe(30);
  });
  it("month-on-month splits top-ups from growth", () => {
    const accts = [{ events: [{ type: "topup" as const, date: "2026-10-11", amount: pence(1000) }, { type: "set" as const, date: "2026-10-12", amount: pence(9) }] }, {}];
    expect(M.depositsInMonth(accts, "2026-10")).toBe(pence(1000));
    expect(M.depositsInMonth(accts, "2026-09")).toBe(0);
    const b = M.momBreakdown([{ month: "2026-09", totalBalance: pence(3000), monthlyIncome: 0 }, { month: "2026-10", totalBalance: pence(4017.5), monthlyIncome: 0, deposits: pence(1000) }])!;
    expect(b.change).toBe(pence(1017.5)); expect(b.deposits).toBe(pence(1000)); expect(b.growth).toBe(pence(17.5)); expect(b.growthPct).toBeCloseTo(17.5 / 30);
    expect(M.momBreakdown([{ month: "2026-09", totalBalance: pence(3000), monthlyIncome: 0 }, { month: "2026-10", totalBalance: pence(3010), monthlyIncome: 0 }])!.deposits).toBe(0);
    expect(M.momBreakdown([])).toBeNull();
    expect(M.momBreakdown([{ month: "2026-09", totalBalance: 0, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 1, monthlyIncome: 0 }])).toBeNull();
  });
});
