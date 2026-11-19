import { describe, expect, it } from "vitest";
import { fromStoredPence, isStoredPenceAppData, toPence, toStoredPence, withStableMoneyIds } from "../lib/money-storage";
import type { Account, AppData } from "../lib/types";

const account: Account = {
  id: "holding-1", provider: "Trading 212", label: "ISA", holdingName: "Realty Income",
  balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2026-12-01",
  colour: "#000", payouts: [{ date: "2026-11-01", amount: 4.05, kind: "actual", incomeType: "dividend" }],
  events: [{ type: "set", date: "2026-10-01", amount: 1100 }, { type: "topup", date: "2026-10-02", amount: 55.28 }],
  createdAt: "2026-01-01", investment: { shares: 25.7, averagePriceGBP: 42.15 },
  creditCard: undefined,
  marketValuation: { priceUSD: 62.1, fxRate: 0.78, fxDate: "2026-11-18", appliedAt: "2026-11-18T12:00:00Z", recordedBalance: 1080.25 },
};
const data: AppData = {
  version: 1, accounts: [account], snapshots: [{ month: "2026-10", totalBalance: 1100, monthlyIncome: 5.21, deposits: 55.28, withdrawals: 2.02 }],
  lastBackupAt: null, projection: { monthlyDeposit: 120.35, years: 5 },
};

describe("integer-pence storage", () => {
  it("rounds decimal noise to the nearest safe penny", () => {
    expect(toPence(0.1 + 0.2)).toBe(30);
    expect(toPence(1.005)).toBe(101);
    expect(() => toPence(Number.MAX_SAFE_INTEGER)).toThrow(/too large/);
    expect(() => toPence(Infinity)).toThrow(/finite/);
    expect(() => fromStoredPence({ money: "pence" })).toThrow(/Invalid integer-pence/);
  });

  it("writes every persisted GBP amount as integer pence and preserves quote units", () => {
    const stored = toStoredPence(data);
    expect(stored.money).toBe("pence");
    expect(stored.accounts[0]).toMatchObject({
      currency: "GBP", balance: 115528, bonus: undefined,
      payouts: [{ amount: 405, id: expect.any(String) }],
      events: [{ amount: 110000, id: expect.any(String) }, { amount: 5528, id: expect.any(String) }],
      investment: { shares: 25.7, averagePriceGBP: 42.15 },
      marketValuation: { priceUSD: 62.1, fxRate: 0.78, recordedBalance: 108025 },
    });
    expect(stored.snapshots[0]).toMatchObject({ totalBalance: 110000, monthlyIncome: 521, deposits: 5528, withdrawals: 202 });
    expect(stored.projection?.monthlyDeposit).toBe(12035);
    expect(isStoredPenceAppData(stored)).toBe(true);
    expect(toStoredPence(stored as never)).toBe(stored);
    const restored = fromStoredPence(stored);
    expect(restored.accounts[0]).toMatchObject({ ...account, balance: 1155.28, payouts: [{ ...account.payouts[0], id: expect.any(String) }], events: [{ ...account.events![0], id: expect.any(String) }, { ...account.events![1], id: expect.any(String) }] });
    expect(restored.snapshots).toEqual(data.snapshots);
    expect(restored.projection).toEqual(data.projection);
  });

  it("assigns deterministic unique IDs to legacy history before a format upgrade", () => {
    const legacy = { ...data, accounts: [{ ...account, payouts: account.payouts.map(({ id: _id, ...payout }) => payout), events: account.events!.map(({ id: _id, ...event }) => event) }] };
    const first = withStableMoneyIds(legacy), second = withStableMoneyIds(legacy);
    expect(first.accounts[0].events?.map(event => event.id)).toEqual(second.accounts[0].events?.map(event => event.id));
    expect(first.accounts[0].payouts.map(payout => payout.id)).toEqual(second.accounts[0].payouts.map(payout => payout.id));
    expect(new Set([...first.accounts[0].events!.map(event => event.id), ...first.accounts[0].payouts.map(payout => payout.id)]).size).toBe(3);
    const repeated = withStableMoneyIds({ ...legacy, accounts: [{ ...legacy.accounts[0], events: [
      { id: "same", type: "set" as const, date: "2026-01-01", amount: 1 },
      { id: "same", type: "set" as const, date: "2026-01-02", amount: 2 },
    ], payouts: [{ id: "same", date: "2026-01-03", amount: 3, kind: "actual" as const }] }] });
    expect(new Set([...repeated.accounts[0].events!.map(row => row.id), ...repeated.accounts[0].payouts.map(row => row.id)]).size).toBe(3);
  });

  it("rejects fractional, missing, duplicate, or unsafe stored pence before restore", () => {
    const stored = toStoredPence(data);
    expect(isStoredPenceAppData({ ...stored, accounts: [{ ...stored.accounts[0], balance: 1.5 }] })).toBe(false);
    expect(isStoredPenceAppData({ ...stored, accounts: [{ ...stored.accounts[0], currency: undefined }] })).toBe(false);
    expect(isStoredPenceAppData({ ...stored, accounts: [{ ...stored.accounts[0], events: [{ ...stored.accounts[0].events![0], id: "same" }], payouts: [{ ...stored.accounts[0].payouts[0], id: "same" }] }] })).toBe(false);
    expect(isStoredPenceAppData({ ...stored, projection: { monthlyDeposit: Number.MAX_SAFE_INTEGER + 1, years: 5 } })).toBe(false);
  });

  it("round-trips debt terms without changing percentages or date fields", () => {
    const debt: Account = { ...account, creditCard: { apr: 24.9, minimumPayment: 35.2, plannedPayment: 80.15 }, marketValuation: undefined };
    const restored = fromStoredPence(toStoredPence({ ...data, accounts: [debt] }));
    expect(restored.accounts[0].creditCard).toEqual(debt.creditCard);
  });

  it("round-trips optional bonus, absent projection and snapshot totals without flow fields", () => {
    const input = { ...data, projection: undefined, snapshots: [{ month: "2026-11", totalBalance: 12.34, monthlyIncome: 0 }], accounts: [{ ...account, bonus: { amount: 18.75, expectedDate: "2026-12-01" }, creditCard: { apr: 0, minimumPayment: 0 } }] };
    const stored = toStoredPence(input);
    expect(stored.accounts[0].bonus?.amount).toBe(1875);
    expect(stored.snapshots[0]).toEqual({ month: "2026-11", totalBalance: 1234, monthlyIncome: 0 });
    expect(fromStoredPence(stored)).toMatchObject({ accounts: [{ bonus: { amount: 18.75 }, creditCard: { minimumPayment: 0 } }], projection: undefined });
  });
});
