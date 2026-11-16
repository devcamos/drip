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
    // a set event resets the running balance but is not a deposit or withdrawal
    expect(M.accrue(100, 0, [{ type: "set", date: "2026-10-02", amount: 5 }], "2026-10-01", "2026-10-03")).toMatchObject({ deposits: 0, withdrawals: 0, closing: 5 });
    expect(M.accrue(100, 0, [{ type: "set", date: "2026-10-02", amount: -5 }], "2026-10-01", "2026-10-03").closing).toBe(100);
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

describe("back-dated withdrawals (#80)", () => {
  const withEvents = (balance: number, events: Parameters<typeof M.applyWithdraw>[0]["events"]) => ({ balance, events });
  it("rejects a withdrawal larger than the balance on its date, even when today's balance covers it", () => {
    // £200 on 1 Oct, £500 top-up on 10 Oct: £700 today, but only £200 on 5 Oct.
    const a = withEvents(700, [{ type: "topup", date: "2026-10-10", amount: 500 }]);
    expect(() => M.applyWithdraw(a, 300, "2026-10-05")).toThrow(/balance on that date/);
    expect(M.applyWithdraw(a, 200, "2026-10-05").balance).toBe(500);
    expect(M.applyWithdraw(a, 300, "2026-10-10").balance).toBe(400);
  });
  it("rejects a withdrawal that would take a later point in the history below zero", () => {
    // £100, −£90 on 10 Oct, +£500 on 20 Oct: £510 today. £50 on 5 Oct would leave −£40 after 10 Oct.
    const a = withEvents(510, [{ type: "withdraw", date: "2026-10-10", amount: 90 }, { type: "topup", date: "2026-10-20", amount: 500 }]);
    expect(() => M.applyWithdraw(a, 50, "2026-10-05")).toThrow(/balance on that date/);
    expect(M.applyWithdraw(a, 10, "2026-10-05").balance).toBe(500);
    expect(M.applyWithdraw(a, 510, "2026-10-21").balance).toBe(0);
  });
  it("counts same-day events first and stops at the next manual balance update", () => {
    const sameDay = withEvents(500, [{ type: "topup", date: "2026-10-05", amount: 400 }]);
    expect(M.applyWithdraw(sameDay, 500, "2026-10-05").balance).toBe(0);
    // A later confirmed reading already reflects real withdrawals, so only the stretch before it must stay positive.
    const reset = withEvents(1000, [{ type: "topup", date: "2026-10-10", amount: 500 }, { type: "set", date: "2026-10-15", amount: 1000 }]);
    expect(() => M.applyWithdraw(reset, 800, "2026-10-12")).not.toThrow();
    expect(() => M.applyWithdraw(reset, 900, "2026-10-05")).toThrow(/balance on that date/);
    const setSameDay = withEvents(300, [{ type: "set", date: "2026-10-05", amount: 300 }]);
    expect(M.applyWithdraw(setSameDay, 300, "2026-10-05").balance).toBe(0);
  });
});

describe("back-dated withdrawal invariants across manual balance updates (ARCH-004)", () => {
  const withEvents = (balance: number, events: NonNullable<Parameters<typeof M.applyWithdraw>[0]["events"]>) => ({ balance, events });

  /** Cash running balances from `fromDate` until the next later manual `set` (that set is not applied). */
  function runningBalancesUntilNextSet(account: { balance: number; events?: { type: string; date: string; amount: number }[] }, fromDate: string) {
    let balance = M.confirmedBalanceOn(account, fromDate);
    const balances: number[] = [];
    const ordered = [...(account.events ?? [])]
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.date >= fromDate && (event.type === "topup" || event.type === "withdraw" || event.type === "set"))
      .sort((x, y) => x.event.date.localeCompare(y.event.date) || x.index - y.index)
      .map(({ event }) => event);
    for (const event of ordered) {
      if (event.date > fromDate && event.type === "set") break;
      if (event.type === "set") balance = event.amount;
      else balance += event.type === "topup" ? event.amount : -event.amount;
      balances.push(Number(balance.toFixed(2)));
    }
    return balances;
  }

  function expectInvariantHolds(account: { balance: number; events?: { type: string; date: string; amount: number }[] }, fromDate: string) {
    expect(account.balance).toBeGreaterThanOrEqual(0);
    for (const balance of runningBalancesUntilNextSet(account, fromDate)) {
      expect(balance).toBeGreaterThanOrEqual(0);
    }
  }

  it("allows a withdrawal exactly equal to the lowest balance in the stretch, and the history stays at or above zero", () => {
    const a = withEvents(700, [{ type: "topup", date: "2026-10-10", amount: 500 }]);
    const next = M.applyWithdraw(a, 200, "2026-10-05");
    expect(next.balance).toBe(500);
    expectInvariantHolds(next, "2026-10-05");
    expect(runningBalancesUntilNextSet(next, "2026-10-05")[0]).toBe(0);
    expect(() => M.applyWithdraw(a, 200.01, "2026-10-05")).toThrow(/balance on that date/);
  });

  it("enforces the invariant on a manual update day (same-day set is applied; a later set is a boundary)", () => {
    const onSetDay = withEvents(1000, [
      { type: "set", date: "2026-10-05", amount: 300 },
      { type: "topup", date: "2026-10-20", amount: 700 },
    ]);
    const exact = M.applyWithdraw(onSetDay, 300, "2026-10-05");
    expect(exact.balance).toBe(700);
    expectInvariantHolds(exact, "2026-10-05");
    expect(() => M.applyWithdraw(onSetDay, 300.01, "2026-10-05")).toThrow(/balance on that date/);

    // The confirmed reading on 15 Oct already reflects later reality, so only the stretch before it must stay non-negative.
    const beforeLaterSet = withEvents(1000, [
      { type: "topup", date: "2026-10-10", amount: 500 },
      { type: "set", date: "2026-10-15", amount: 1000 },
    ]);
    const beforeTopup = M.applyWithdraw(beforeLaterSet, 500, "2026-10-05");
    expectInvariantHolds(beforeTopup, "2026-10-05");
    expect(() => M.applyWithdraw(beforeLaterSet, 500.01, "2026-10-05")).toThrow(/balance on that date/);
    const afterTopup = M.applyWithdraw(beforeLaterSet, 800, "2026-10-12");
    expectInvariantHolds(afterTopup, "2026-10-12");
  });

  it("keeps the history non-negative before the first manual update", () => {
    const beforeAnySet = withEvents(400, [{ type: "topup", date: "2026-10-20", amount: 100 }]);
    const next = M.applyWithdraw(beforeAnySet, 300, "2026-10-05");
    expect(next.balance).toBe(100);
    expectInvariantHolds(next, "2026-10-05");
    expect(() => M.applyWithdraw(beforeAnySet, 301, "2026-10-05")).toThrow(/balance on that date/);
  });

  it("stops at the next of several manual updates, and does not let a later stretch go below zero", () => {
    // 1 Oct set £400, 8 Oct withdraw £50, 15 Oct set £800, 22 Oct top-up £200 → £1,000 today.
    const a = withEvents(1000, [
      { type: "set", date: "2026-10-01", amount: 400 },
      { type: "withdraw", date: "2026-10-08", amount: 50 },
      { type: "set", date: "2026-10-15", amount: 800 },
      { type: "topup", date: "2026-10-22", amount: 200 },
    ]);
    // 3 Oct is in the first stretch (after £400, before the 8 Oct £50). Lowest in that stretch is £350.
    const allowed = M.applyWithdraw(a, 350, "2026-10-03");
    expect(allowed.balance).toBe(650);
    expectInvariantHolds(allowed, "2026-10-03");
    expect(() => M.applyWithdraw(a, 351, "2026-10-03")).toThrow(/balance on that date/);
    // After the 15 Oct reading, the later stretch is independent and can support a larger withdrawal.
    const afterSecondSet = M.applyWithdraw(a, 800, "2026-10-16");
    expect(afterSecondSet.balance).toBe(200);
    expectInvariantHolds(afterSecondSet, "2026-10-16");
  });
});
