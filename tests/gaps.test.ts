import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";

describe("withdrawals", () => {
  it("reduces balance, logs, rejects bad amounts", () => {
    const a = M.applyWithdraw({ balance: 1000, events: [] }, 200.004, "2026-10-15");
    expect(a.balance).toBe(800);
    expect(a.events).toEqual([{ type: "withdraw", date: "2026-10-15", amount: 200 }]);
    expect(M.applyWithdraw({ balance: 10, events: undefined }, 10, "2026-10-15").balance).toBe(0);
    expect(() => M.applyWithdraw(a, 0, "2026-10-15")).toThrow();
    expect(() => M.applyWithdraw(a, 801, "2026-10-15")).toThrow(/more than the balance/);
  });
  it("mid-period withdrawal accrues on the old balance before and the smaller one after", () => {
    const r = M.accrue(3000, 7.3, [{ type: "withdraw", date: "2026-10-11", amount: 1000 }], "2026-10-01", "2026-10-31");
    const d = 0.073 / 365;
    expect(r.closing).toBeCloseTo((3000 * Math.pow(1 + d, 10) - 1000) * Math.pow(1 + d, 20), 8);
    expect(r.withdrawals).toBe(1000);
    expect(r.interest).toBeCloseTo(r.closing - 3000 + 1000, 8);
    // a withdrawal larger than the balance is capped
    expect(M.accrue(100, 0, [{ type: "withdraw", date: "2026-10-02", amount: 500 }], "2026-10-01", "2026-10-03")).toMatchObject({ withdrawals: 100, closing: 0 });
    // set events don't move money
    expect(M.accrue(100, 0, [{ type: "set", date: "2026-10-02", amount: 5 }], "2026-10-01", "2026-10-03").closing).toBe(100);
  });
  it("Trends: withdrawals are not negative growth", () => {
    const b = M.momBreakdown([{ month: "2026-09", totalBalance: 3000, monthlyIncome: 0 }, { month: "2026-10", totalBalance: 2017.5, monthlyIncome: 0, deposits: 0, withdrawals: 1000 }])!;
    expect(b.withdrawals).toBe(1000);
    expect(b.growth).toBeCloseTo(17.5);
    expect(M.withdrawalsInMonth([{ events: [{ type: "withdraw", date: "2026-10-03", amount: 40 }, { type: "topup", date: "2026-10-03", amount: 9 }] }], "2026-10")).toBe(40);
  });
});

describe("rate history", () => {
  it("rateOn picks the period in force", () => {
    const h = [{ from: "2026-10-16", ratePct: 6.5 }, { from: "2026-01-01", ratePct: 7 }];
    expect(M.rateOn(h, "2025-12-31")).toBe(7);
    expect(M.rateOn(h, "2026-10-15")).toBe(7);
    expect(M.rateOn(h, "2026-10-16")).toBe(6.5);
    expect(M.rateOn([], "2026-10-16")).toBe(0);
  });
  it("accrual uses the rate in force each day", () => {
    const h = [{ from: "2026-01-01", ratePct: 7.3 }, { from: "2026-10-11", ratePct: 3.65 }];
    const r = M.accrue(1000, h, [], "2026-10-01", "2026-10-31");
    expect(r.closing).toBeCloseTo(1000 * Math.pow(1 + 0.073 / 365, 10) * Math.pow(1 + 0.0365 / 365, 20), 8);
    expect(M.periodGrowth(1000, h, [], "2026-10-01", "2026-10-31").closing).toBeCloseTo(r.closing, 10);
  });
  it("applyRateChange records effective date; future change doesn't alter today's rate", () => {
    let a = { ratePct: 7, createdAt: "2026-01-05T10:00:00Z", rateHistory: undefined as any };
    a = M.applyRateChange(a, 6.5, "2026-11-01", "2026-10-15");
    expect(a.rateHistory).toEqual([{ from: "2026-01-05", ratePct: 7 }, { from: "2026-11-01", ratePct: 6.5 }]);
    expect(a.ratePct).toBe(7);
    a = M.applyRateChange(a, 6, "2026-11-01", "2026-11-02"); // same date replaces
    expect(a.rateHistory).toHaveLength(2);
    expect(a.ratePct).toBe(6);
    expect(() => M.applyRateChange(a, -1, "2026-11-01", "2026-11-02")).toThrow();
    expect(() => M.applyRateChange(a, 100, "2026-11-01", "2026-11-02")).toThrow();
  });
  it("migrates old accounts", () => {
    const old = { id: "a", provider: "Zopa", label: "", balance: 1, ratePct: 7, rateType: "interest" as const, frequency: "monthly" as const, nextPayoutDate: "2026-10-28", colour: "", payouts: [], createdAt: "" };
    const d = M.migrateData({ version: 1, accounts: [old, { ...old, id: "b", createdAt: "2026-03-01T00:00:00Z", rateHistory: [{ from: "2026-03-01", ratePct: 5 }] }], snapshots: [], lastBackupAt: null }, "2026-10-15");
    expect(d.accounts[0].rateHistory).toEqual([{ from: "0000-01-01", ratePct: 7 }]);
    expect(d.accounts[0].events).toEqual([]);
    expect(d.accounts[1].ratePct).toBe(5);
  });
});
