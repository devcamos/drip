import { describe, expect, it } from "vitest";
import type { Account } from "../lib/types";
import * as M from "../lib/maths";
import { PRODUCTS, productLabel, validDate, validProductFields } from "../lib/products";
import { isAppData, emptyData } from "../lib/db";
import { pence, payout, event } from "./money-fixtures";

const account = (overrides: Partial<Account> = {}): Account => ({ id: "a", provider: "MoneyFarm", label: "", balance: pence(3000), currency: "GBP", ratePct: 4,
  rateType: "interest", frequency: "daily", nextPayoutDate: "2026-10-18", colour: "", payouts: [], events: [], createdAt: "2026-10-01", ...overrides });
describe("product and income calculations", () => {
  it("sets product defaults without inferring ISA status from a provider", () => {
    expect(PRODUCTS["cash-isa"]).toMatchObject({ rateType: "interest", taxWrapper: "cash-isa" });
    expect(PRODUCTS["stocks-funds"]).toMatchObject({ rateType: "dividend", frequency: "quarterly", reinvestIncome: false });
    for (const category of ["easy-access", "regular-saver", "current-account"] as const) expect(PRODUCTS[category].rateType).toBe("interest");
    expect(productLabel(account())).toBe("Unclassified account");
    expect(productLabel(account({ productCategory: "cash-isa" }))).toBe("Cash ISA");
    expect(productLabel(account({ rateType: "dividend" }))).toBe("Stocks / funds");
    expect(productLabel(account({ taxWrapper: "stocks-shares-isa" }))).toMatch(/Stocks & Shares ISA/);
  });
  it("keeps confirmed balances and income independent, including after rate changes", () => {
    const initial = account({ bonus: { amount: pence(15.44), expectedDate: "2027-05-06" }, events: [event({ type: "interest", date: "2026-09-01", amount: pence(100) })] });
    const received = M.recordIncome(initial, pence(22.65), "2026-09-30", "interest");
    expect(received.balance).toBe(pence(3000)); expect(initial.payouts).toEqual([]);
    expect(M.recordedIncome([received], "2026-09", "2026-10-18")).toBe(pence(22.65));
    expect(M.pendingBonuses([received])).toBe(pence(15.44));
    const updated = M.applyRateChange(M.applySetBalance(received, pence(3200), "2026-10-18"), 3, "2026-10-18", "2026-10-18");
    expect(M.monthlyIncome(updated.balance, updated.ratePct)).toBe(pence(8));
    expect(M.recordedIncome([updated], undefined, "2026-10-18")).toBe(pence(22.65));
    expect(updated.payouts[0].amount).toBe(pence(22.65));
    expect(() => M.recordIncome(initial, Infinity as unknown as number, "2026-09-30", "interest")).toThrow();
    expect(() => M.recordIncome(initial, 0, "2026-09-30", "interest")).toThrow();
    expect(() => M.recordIncome(initial, pence(1), "2026-02-30", "interest")).toThrow();
  });
  it("totals only actual receipts in calendar months, never estimates, transfers or future entries", () => {
    const a = account({ payouts: [
      payout({ date: "2026-09-30", amount: pence(22.65), kind: "actual" }),
      payout({ date: "2026-10-01", amount: pence(5.19), kind: "actual" }),
      payout({ date: "2026-10-18", amount: pence(5.26), kind: "actual" }),
      payout({ date: "2026-10-20", amount: pence(10), kind: "actual" }),
      payout({ date: "2026-10-01", amount: pence(999), kind: "expected" }),
    ] });
    expect(M.recordedIncome([a], "2026-10", "2026-10-18")).toBe(pence(10.45));
    expect(M.recordedIncome([a], undefined, "2026-10-18")).toBe(pence(33.1));
    expect(M.recordedIncome([M.applyTopUp(a, pence(200), "2026-10-18")], undefined, "2026-10-18")).toBe(pence(33.1));
  });
  it("forecasts a pending bonus once, never before its date or after its receipt", () => {
    const a = account({ ratePct: 0, bonus: { amount: pence(15.44), expectedDate: "2026-12-18" } });
    const forecast = M.projection([a], 4, 0, "2026-10-18");
    expect(forecast.map(p => p.balance)).toEqual([pence(3000), pence(3015.44), pence(3015.44), pence(3015.44)]);
    expect(forecast.at(-1)!.income).toBe(pence(15.44));
    expect(a.balance).toBe(pence(3000)); expect(a.payouts).toEqual([]);
    const paid = M.recordIncome(a, pence(15.44), "2026-12-18", "bonus");
    expect(paid.bonus).toBeUndefined(); expect(paid.balance).toBe(pence(3000));
    expect(M.projection([paid], 12, 0, "2026-12-18").at(-1)!.income).toBe(0);
    expect(M.recordedIncome([paid], undefined, "2026-12-18")).toBe(pence(15.44));
    expect(M.projection([a], 12, 0, "2027-01-01").at(-1)!.income).toBe(0);
    expect(M.projection([a], 1, 0, "2026-12-18")[0].income).toBe(pence(15.44));
  });
  it("predicts dividends without stock-price growth and only reinvests when selected", () => {
    const stocks = account({ balance: pence(1000), ratePct: 12, rateType: "dividend" });
    const paidOut = M.projection([stocks], 12, 0, "2026-10-18").at(-1)!;
    expect(paidOut.balance).toBe(pence(1000)); expect(paidOut.income).toBe(pence(120));
    expect(M.projection([{ ...stocks, reinvestIncome: true }], 12).at(-1)!.balance).toBeCloseTo(pence(1000) * 1.01 ** 12);
    const bonus = M.projection([{ ...stocks, bonus: { amount: pence(10), expectedDate: "2026-11-01" } }], 1, 0, "2026-10-18")[0];
    expect(bonus).toMatchObject({ balance: pence(1000), income: pence(20) });
  });
  it("keeps deposits out of predicted income, allocating by starting balances", () => {
    const a = account({ balance: pence(1000), ratePct: 12 });
    const b = account({ balance: pence(1000), ratePct: 0 });
    const forecast = M.projection([a, b], 2, pence(200), "2026-10-18");
    expect(forecast[0]).toEqual({ month: 1, balance: pence(2210), income: pence(10) });
    expect(forecast[1].balance).toBeCloseTo(pence(2421.1)); expect(forecast[1].income).toBeCloseTo(pence(21.1));
    expect(M.projection([], 2, pence(200))[1]).toEqual({ month: 2, balance: pence(400), income: 0 });
    expect(M.projection([account({ balance: 0 })], 1, pence(200))[0]).toMatchObject({ balance: pence(200), income: 0 });
  });
  it("preserves older balances, actual receipts and legacy estimates without inventing a category", () => {
    const old = { id: "a", provider: "MoneyFarm", label: "", balance: 3012, ratePct: 4, rateType: "interest" as const, frequency: "daily" as const, nextPayoutDate: "2026-10-18", colour: "", createdAt: "2026-10-01", accruedThrough: "2026-10-10", events: [{ type: "interest" as const, amount: 12, date: "2026-10-01" }], payouts: [{ kind: "actual" as const, date: "2026-10-01", amount: 22.65 }] };
    const result = M.migrateData({ version: 1, accounts: [old], snapshots: [], lastBackupAt: null }, "2026-10-18");
    expect(result.accounts[0].balance).toBe(pence(3012));
    expect(result.accounts[0].currency).toBe("GBP");
    expect(result.accounts[0].productCategory).toBeUndefined();
    expect(M.recordedIncome(result.accounts, undefined, "2026-10-18")).toBe(pence(22.65));
    expect(isAppData(result)).toBe(true);
  });
  it("validates portable category, ISA, bonus and income fields before restoring", () => {
    expect(validProductFields(account({ productCategory: "cash-isa", taxWrapper: "cash-isa", reinvestIncome: true, bonus: { amount: pence(15.44), expectedDate: "2027-05-06" } }))).toBe(true);
    expect(validDate("2028-02-29")).toBe(true); expect(validDate("2026-02-29")).toBe(false); expect(validDate(null)).toBe(false);
    const invalid = [{ productCategory: "made-up" }, { taxWrapper: "made-up" }, { reinvestIncome: "yes" }, { bonus: null }, { bonus: { amount: Infinity, expectedDate: "2027-05-06" } }, { bonus: { amount: 1, expectedDate: "invalid" } }, { payouts: [{ incomeType: "made-up" }] }];
    for (const value of invalid) expect(isAppData({ ...emptyData(), accounts: [{ ...account(), ...value }] })).toBe(false);
  });
  it("validates holding names without excluding existing accounts that have no individual holding", () => {
    expect(isAppData({ ...emptyData(), accounts: [account()] })).toBe(true);
    expect(validProductFields(account({ productCategory: "stocks-funds", holdingName: "Custom fund" }))).toBe(true);
    for (const holdingName of [null, 123, {}, "", " ", "x".repeat(101)]) {
      expect(isAppData({ ...emptyData(), accounts: [{ ...account(), productCategory: "stocks-funds", holdingName }] })).toBe(false);
    }
    expect(validProductFields(account({ productCategory: "easy-access", holdingName: "Realty Income" }))).toBe(false);
  });
});
