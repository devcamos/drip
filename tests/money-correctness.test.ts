import { describe, expect, it } from "vitest";
import * as M from "../lib/maths";
import { emptyData, isAppData } from "../lib/db";
import type { Account, AppData } from "../lib/types";
import { pence, baseAccount, event, payout } from "./money-fixtures";

describe("money correctness", () => {
  it("0.1+0.2-style top-ups are exact in pence", () => {
    let a = { balance: 0, currency: "GBP" as const, events: [] as NonNullable<Account["events"]> };
    a = M.applyTopUp(a, M.toPence(0.1), "2026-01-01");
    a = M.applyTopUp(a, M.toPence(0.2), "2026-01-02");
    expect(a.balance).toBe(30);
    expect(a.events).toHaveLength(2);
  });

  it("365 days of daily accrual: sum of interest events equals balance delta", () => {
    const opening = pence(10_000);
    const r = M.accrue(opening, 3.65, [], "2026-01-01", "2027-01-01");
    expect(r.interestEvents).toHaveLength(365);
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(r.closing - r.opening).toBe(r.interest);
  });

  it("leap year span still uses /365 and interest events sum to the balance delta", () => {
    const opening = pence(10_000);
    const r = M.accrue(opening, 3.65, [], "2028-01-01", "2029-01-01");
    expect(r.interestEvents).toHaveLength(366);
    expect(r.interestEvents.reduce((s, e) => s + e.amount, 0)).toBe(r.interest);
    expect(r.closing - r.opening - r.deposits + r.withdrawals).toBe(r.interest);
  });

  it("same event id applied twice leaves one event", () => {
    const id = "same-topup-id";
    let a = baseAccount({ balance: pence(100), events: [] });
    a = M.applyTopUp(a, pence(10), "2026-01-01", id);
    const again = M.applyTopUp(a, pence(10), "2026-01-01", id);
    expect(again).toEqual(a);
    expect(again.events).toHaveLength(1);
    expect(again.balance).toBe(pence(110));

    const payId = "same-payout-id";
    let withPay = M.recordIncome(a, pence(5), "2026-01-02", "interest", payId);
    withPay = M.recordIncome(withPay, pence(5), "2026-01-02", "interest", payId);
    expect(withPay.payouts).toHaveLength(1);
  });

  it("migrates legacy float-pound data to integer pence with ids", () => {
    const legacy: AppData = {
      version: 1,
      accounts: [{
        id: "legacy", provider: "Zopa", label: "Pot", balance: 3012.34, ratePct: 4, rateType: "interest",
        frequency: "monthly", nextPayoutDate: "2026-11-01", colour: "", createdAt: "2026-01-01",
        payouts: [{ date: "2026-10-01", amount: 22.65, kind: "actual", incomeType: "interest" }],
        events: [{ type: "interest", date: "2026-10-01", amount: 12.3456 }, { type: "topup", date: "2026-10-02", amount: 100 }],
      }],
      snapshots: [{ month: "2026-09", totalBalance: 2900.5, monthlyIncome: 10.25, deposits: 50.1, withdrawals: 1.2 }],
      projection: { monthlyDeposit: 200.5, years: 1 },
      lastBackupAt: null,
    };
    expect(isAppData(legacy)).toBe(true);
    const migrated = M.migrateData(legacy, "2026-10-18");
    expect(migrated.money).toBe("pence");
    expect(migrated.accounts[0].currency).toBe("GBP");
    expect(migrated.accounts[0].balance).toBe(pence(3012.34));
    expect(migrated.accounts[0].payouts[0]).toMatchObject({ amount: pence(22.65), id: expect.any(String) });
    expect(migrated.accounts[0].events).toEqual([
      expect.objectContaining({ type: "interest", amount: pence(12.3456), id: expect.any(String) }),
      expect.objectContaining({ type: "topup", amount: pence(100), id: expect.any(String) }),
    ]);
    expect(migrated.snapshots[0]).toEqual({ month: "2026-09", totalBalance: pence(2900.5), monthlyIncome: pence(10.25), deposits: pence(50.1), withdrawals: pence(1.2) });
    expect(migrated.projection?.monthlyDeposit).toBe(pence(200.5));
    expect(isAppData(migrated)).toBe(true);
    // Idempotent: migrating again does not re-scale.
    const again = M.migrateData(migrated, "2026-10-18");
    expect(again.accounts[0].balance).toBe(migrated.accounts[0].balance);
  });

  it("restore of backup with bad events is rejected", () => {
    const good = { ...emptyData(), accounts: [baseAccount()] };
    expect(isAppData(good)).toBe(true);
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), events: [{ type: "nope", date: "2026-01-01", amount: 1, id: "x" }] }] })).toBe(false);
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), events: [{ type: "topup", date: "2026-01-01", amount: NaN, id: "x" }] }] })).toBe(false);
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), events: "bad" as unknown as [] }] })).toBe(false);
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), events: [{ type: "topup", date: "2026-01-01", amount: 100 }] }] })).toBe(false); // pence requires id
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), payouts: [{ date: "2026-01-01", amount: 100, kind: "actual" }] }] })).toBe(false);
    expect(isAppData({ ...emptyData(), accounts: [{ ...baseAccount(), events: [event({ type: "topup", date: "2026-01-01", amount: pence(1) })], payouts: [payout({ date: "2026-01-01", amount: pence(1), kind: "actual" })] }] })).toBe(true);
  });

  it("withdraw exactly balance OK, +1p refused", () => {
    const a = baseAccount({ balance: pence(12.34), events: [] });
    expect(M.applyWithdraw(a, pence(12.34), "2026-01-01").balance).toBe(0);
    expect(() => M.applyWithdraw(a, pence(12.34) + 1, "2026-01-01")).toThrow(/more than the balance/);
  });
});
