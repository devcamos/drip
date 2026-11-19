import { describe, expect, it } from "vitest";
import * as M from "../lib/maths";
import type { Account, Snapshot } from "../lib/types";

const account = (over: Partial<Account> = {}): Account => ({
  id: "a", provider: "Zopa", label: "", balance: 1200, ratePct: 0, rateType: "interest", frequency: "monthly",
  nextPayoutDate: "2026-12-01", colour: "#b85a2a", payouts: [], events: [], createdAt: "2026-09-10T09:00:00.000Z", ...over,
});

describe("month history rebuilt from the event log (#8)", () => {
  it("fills every month without a snapshot from creation to today, keeping saved snapshots", () => {
    const saved: Snapshot = { month: "2026-10", totalBalance: 999, monthlyIncome: 1, deposits: 0, withdrawals: 0 };
    const history = M.monthlyHistory([saved], [account({ events: [{ type: "topup", date: "2026-11-02", amount: 200 }] })], "2026-11-16");
    expect(history.map(s => s.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(history[1]).toBe(saved);
    // Before the top-up the confirmed balance was 1,000; today's month uses the live balance.
    expect(history[0]).toMatchObject({ totalBalance: 1000, rebuilt: true, deposits: 0 });
    expect(history[2]).toMatchObject({ totalBalance: 1200, rebuilt: true, deposits: 200 });
  });

  it("uses past manual balance updates as month-end anchors, so month-on-month change appears straight away", () => {
    const a = M.withPastBalances(account({ createdAt: "2026-11-10T00:00:00.000Z" }), [{ date: "2026-09-30", balance: 900 }, { date: "2026-10-31", balance: 1000 }], "2026-11-10");
    const history = M.monthlyHistory([], [a], "2026-11-16");
    expect(history.map(s => [s.month, s.totalBalance])).toEqual([["2026-09", 900], ["2026-10", 1000], ["2026-11", 1200]]);
    expect(M.momBreakdown(history)).toMatchObject({ change: 200, growth: 200, growthPct: 20 });
  });

  it("estimates past income at the rate in force that month", () => {
    const a = account({ balance: 12000, ratePct: 6, rateHistory: [{ from: "2026-09-10", ratePct: 3 }, { from: "2026-11-01", ratePct: 6 }] });
    const [sep, , nov] = M.monthlyHistory([], [a], "2026-11-16");
    expect(sep.monthlyIncome).toBe(M.round2(M.monthlyIncome(12000, 3, "2026-09-30")));
    expect(nov.monthlyIncome).toBe(M.round2(M.accountMonthlyIncome(a, "2026-11-16")));
  });

  it("leaves out credit cards, archived accounts and months before an account existed", () => {
    const later = account({ id: "b", balance: 50, createdAt: "2026-11-01T00:00:00.000Z" });
    const card = account({ id: "c", productCategory: "credit-card", balance: 400 });
    const archived = account({ id: "d", archivedAt: "2026-10-01T00:00:00.000Z" });
    const history = M.monthlyHistory([], [account(), later, card, archived], "2026-11-16");
    expect(history.map(s => s.totalBalance)).toEqual([1200, 1200, 1250]);
  });

  it("never reports a negative rebuilt balance and keeps future-dated saved snapshots", () => {
    const a = account({ balance: 0, events: [{ type: "topup", date: "2026-10-05", amount: 500 }] });
    const future: Snapshot = { month: "2027-01", totalBalance: 1, monthlyIncome: 0 };
    const history = M.monthlyHistory([future], [a], "2026-11-16");
    expect(history[0]).toMatchObject({ month: "2026-09", totalBalance: 0 });
    expect(history.at(-1)).toBe(future);
  });

  it("never invents £0 months between saved snapshots when there are no accounts to rebuild from", () => {
    expect(M.monthlyHistory([], [], "2026-11-16")).toEqual([]);
    const only: Snapshot = { month: "2026-10", totalBalance: 5, monthlyIncome: 0 };
    expect(M.monthlyHistory([only, { month: "2026-08", totalBalance: 4, monthlyIncome: 0 }], [], "2026-11-16").map(s => s.month)).toEqual(["2026-08", "2026-10"]);
    expect(M.monthlyHistory([only], [], "2026-11-16")).toEqual([only]);
  });

  it("starts history at the earliest valid date among creation and logged events", () => {
    expect(M.historyStart(account({ events: [{ type: "set", date: "2026-08-31", amount: 1 }] }))).toBe("2026-08-31");
    expect(M.historyStart(account({ createdAt: "not a date", events: undefined }))).toBe("");
  });
});

describe("past balances entered once when adding an account (#8)", () => {
  it("offers the three previous month ends, clamping to each month's length", () => {
    expect(M.pastMonthEnds("2026-03-31")).toEqual(["2026-02-28", "2026-01-31", "2025-12-31"]);
    expect(M.pastMonthEnds("2028-03-15", 1)).toEqual(["2028-02-29"]);
  });

  it("skips blanks, rounds to pennies and orders oldest first", () => {
    expect(M.parsePastBalances(["1000.005", " ", "800"], ["2026-10-31", "2026-09-30", "2026-08-31"])).toEqual([{ date: "2026-08-31", balance: 800 }, { date: "2026-10-31", balance: 1000.01 }]);
  });

  it("rejects negative, non-numeric or out-of-range entries instead of saving part of them", () => {
    for (const bad of ["-1", "abc", "1e13", "Infinity"]) expect(M.parsePastBalances([bad], ["2026-10-31"])).toBeNull();
    expect(M.parsePastBalances(["1"], ["2026-02-30"])).toBeNull();
  });

  it("records them as dated balance updates and anchors today's entered balance", () => {
    const a = account({ events: [] });
    expect(M.withPastBalances(a, [], "2026-11-16")).toBe(a);
    expect(M.withPastBalances(a, [{ date: "2026-11-16", balance: 5 }], "2026-11-16")).toBe(a);
    const next = M.withPastBalances(a, [{ date: "2026-10-31", balance: 1000 }], "2026-11-16");
    expect(next.balance).toBe(1200);
    expect(next.events).toEqual([expect.objectContaining({ type: "set", date: "2026-10-31", amount: 1000, id: expect.any(String) }), expect.objectContaining({ type: "set", date: "2026-11-16", amount: 1200, id: expect.any(String) })]);
    expect(M.withPastBalances({ balance: 1, events: undefined }, [{ date: "2026-10-31", balance: 1 }], "2026-11-16").events).toHaveLength(2);
  });

  it("keeps today's balance confirmed after adding a lower past balance (withdrawals and interest)", () => {
    const today = M.localToday(), [lastMonthEnd] = M.pastMonthEnds(today, 1), created = today + "T00:00:00.000Z";
    const a = M.withPastBalances(account({ createdAt: created }), [{ date: lastMonthEnd, balance: 1000 }], today);
    expect(M.confirmedBalanceOn(a, M.addMonths(today, 1))).toBe(1200);
    // Without the anchor, last month's £1,000 capped this withdrawal.
    expect(M.applyWithdraw(a, 1100, today).balance).toBe(100);
    const rated = M.withPastBalances(account({ ratePct: 5, createdAt: created }), [{ date: lastMonthEnd, balance: 1000 }], today);
    expect(M.currentPeriodInterest(rated, today)).toBe(M.currentPeriodInterest(account({ ratePct: 5, createdAt: created }), today));
  });
});
