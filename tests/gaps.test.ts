import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";
import { pence } from "./money-fixtures";

describe("withdrawals", () => {
  it("reduces balance, logs, rejects bad amounts", () => {
    const a = M.applyWithdraw({ balance: pence(1000), currency: "GBP", events: [] }, M.toPence(200.004), "2026-10-15");
    expect(a.balance).toBe(pence(800));
    expect(a.events).toEqual([{ id: expect.any(String), type: "withdraw", date: "2026-10-15", amount: pence(200) }]);
    expect(M.applyWithdraw({ balance: pence(10), currency: "GBP", events: undefined }, pence(10), "2026-10-15").balance).toBe(0);
    expect(() => M.applyWithdraw(a, 0, "2026-10-15")).toThrow();
    expect(() => M.applyWithdraw(a, pence(801), "2026-10-15")).toThrow(/more than the balance/);
  });
  it("withdraw exactly balance OK, +1p refused", () => {
    const a = { balance: pence(10), currency: "GBP" as const, events: [] };
    expect(M.applyWithdraw(a, pence(10), "2026-10-15").balance).toBe(0);
    expect(() => M.applyWithdraw(a, pence(10) + 1, "2026-10-15")).toThrow(/more than the balance/);
  });
  it("mid-period withdrawal accrues on the old balance before and the smaller one after", () => {
    const r = M.accrue(pence(3000), 7.3, [{ type: "withdraw", date: "2026-10-11", amount: pence(1000) }], "2026-10-01", "2026-10-31");
    expect(r.withdrawals).toBe(pence(1000));
    expect(r.interest).toBe(r.closing - pence(3000) + pence(1000));
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(M.accrue(pence(100), 0, [{ type: "withdraw", date: "2026-10-02", amount: pence(500) }], "2026-10-01", "2026-10-03")).toMatchObject({ withdrawals: pence(100), closing: 0 });
    expect(M.accrue(pence(100), 0, [{ type: "set", date: "2026-10-02", amount: pence(5) }], "2026-10-01", "2026-10-03").closing).toBe(pence(100));
  });
  it("Trends: withdrawals are not negative growth", () => {
    const b = M.momBreakdown([{ month: "2026-09", totalBalance: pence(3000), monthlyIncome: 0 }, { month: "2026-10", totalBalance: pence(2017.5), monthlyIncome: 0, deposits: 0, withdrawals: pence(1000) }])!;
    expect(b.withdrawals).toBe(pence(1000));
    expect(b.growth).toBe(pence(17.5));
    expect(M.withdrawalsInMonth([{ events: [{ type: "withdraw", date: "2026-10-03", amount: pence(40) }, { type: "topup", date: "2026-10-03", amount: pence(9) }] }], "2026-10")).toBe(pence(40));
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
    const r = M.accrue(pence(1000), h, [], "2026-10-01", "2026-10-31");
    expect(r.interest).toBe(r.closing - pence(1000));
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(M.periodGrowth(pence(1000), h, [], "2026-10-01", "2026-10-31").closing).toBe(r.closing);
  });
  it("applyRateChange records effective date; future change doesn't alter today's rate", () => {
    let a = { ratePct: 7, createdAt: "2026-01-05T10:00:00Z", rateHistory: undefined as undefined };
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
    expect(d.money).toBe("pence");
    expect(d.accounts[0].currency).toBe("GBP");
    expect(d.accounts[0].balance).toBe(pence(1));
    expect(d.accounts[0].rateHistory).toEqual([{ from: "0000-01-01", ratePct: 7 }]);
    expect(d.accounts[0].events).toEqual([]);
    expect(d.accounts[1].ratePct).toBe(5);
  });
});
