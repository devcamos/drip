import { describe, expect, it } from "vitest";
import type { Account } from "../lib/types";
import * as M from "../lib/maths";
import { PRODUCTS, productLabel, validDate, validProductFields } from "../lib/products";
import { isAppData, emptyData } from "../lib/db";

const account = (overrides: Partial<Account> = {}): Account => ({ id: "a", provider: "MoneyFarm", label: "", balance: 3000, ratePct: 4,
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
    const initial = account({ bonus: { amount: 15.44, expectedDate: "2027-05-06" }, events: [{ type: "interest", date: "2026-09-01", amount: 100 }] });
    const received = M.recordIncome(initial, 22.65, "2026-09-30", "interest");
    expect(received.balance).toBe(3000); expect(initial.payouts).toEqual([]);
    expect(M.recordedIncome([received], "2026-09", "2026-10-18")).toBe(22.65);
    expect(M.pendingBonuses([received])).toBe(15.44);
    const updated = M.applyRateChange(M.applySetBalance(received, 3200, "2026-10-18"), 3, "2026-10-18", "2026-10-18");
    expect(M.monthlyIncome(updated.balance, updated.ratePct)).toBe(8);
    expect(M.recordedIncome([updated], undefined, "2026-10-18")).toBe(22.65);
    expect(updated.payouts[0].amount).toBe(22.65);
    expect(() => M.recordIncome(initial, Infinity, "2026-09-30", "interest")).toThrow();
    expect(() => M.recordIncome(initial, 0.001, "2026-09-30", "interest")).toThrow();
    expect(() => M.recordIncome(initial, 1, "2026-02-30", "interest")).toThrow();
  });
  it("totals only actual receipts in calendar months, never estimates, transfers or future entries", () => {
    const a = account({ payouts: [{ date: "2026-09-30", amount: 22.65, kind: "actual" }, { date: "2026-10-01", amount: 5.19, kind: "actual" },
      { date: "2026-10-18", amount: 5.26, kind: "actual" }, { date: "2026-10-20", amount: 10, kind: "actual" }, { date: "2026-10-01", amount: 999, kind: "expected" }] });
    expect(M.recordedIncome([a], "2026-10", "2026-10-18")).toBeCloseTo(10.45);
    expect(M.recordedIncome([a], undefined, "2026-10-18")).toBeCloseTo(33.1);
    expect(M.recordedIncome([M.applyTopUp(a, 200, "2026-10-18")], undefined, "2026-10-18")).toBeCloseTo(33.1);
  });
  it("forecasts a pending bonus once, never before its date or after its receipt", () => {
    const a = account({ ratePct: 0, bonus: { amount: 15.44, expectedDate: "2026-12-18" } });
    const forecast = M.projection([a], 4, 0, "2026-10-18");
    expect(forecast.map(p => p.balance)).toEqual([3000, 3015.44, 3015.44, 3015.44]);
    expect(forecast.at(-1)!.income).toBe(15.44);
    expect(a.balance).toBe(3000); expect(a.payouts).toEqual([]);
    const paid = M.recordIncome(a, 15.44, "2026-12-18", "bonus");
    expect(paid.bonus).toBeUndefined(); expect(paid.balance).toBe(3000);
    expect(M.projection([paid], 12, 0, "2026-12-18").at(-1)!.income).toBe(0);
    expect(M.recordedIncome([paid], undefined, "2026-12-18")).toBe(15.44);
    expect(M.projection([a], 12, 0, "2027-01-01").at(-1)!.income).toBe(0);
    expect(M.projection([a], 1, 0, "2026-12-18")[0].income).toBe(15.44);
  });
  it("predicts dividends without stock-price growth and only reinvests when selected", () => {
    const stocks = account({ balance: 1000, ratePct: 12, rateType: "dividend" });
    const paidOut = M.projection([stocks], 12, 0, "2026-10-18").at(-1)!;
    expect(paidOut.balance).toBe(1000); expect(paidOut.income).toBe(120);
    expect(M.projection([{ ...stocks, reinvestIncome: true }], 12).at(-1)!.balance).toBeCloseTo(1000 * 1.01 ** 12);
    const bonus = M.projection([{ ...stocks, bonus: { amount: 10, expectedDate: "2026-11-01" } }], 1, 0, "2026-10-18")[0];
    expect(bonus).toMatchObject({ balance: 1000, income: 20 });
  });
  it("keeps deposits out of predicted income, allocating by starting balances", () => {
    const a = account({ balance: 1000, ratePct: 12 });
    const b = account({ balance: 1000, ratePct: 0 });
    const forecast = M.projection([a, b], 2, 200, "2026-10-18");
    expect(forecast[0]).toEqual({ month: 1, balance: 2210, income: 10 });
    expect(forecast[1].balance).toBeCloseTo(2421.1); expect(forecast[1].income).toBeCloseTo(21.1);
    expect(M.projection([], 2, 200)[1]).toEqual({ month: 2, balance: 400, income: 0 });
    expect(M.projection([account({ balance: 0 })], 1, 200)[0]).toMatchObject({ balance: 200, income: 0 });
  });
  it("preserves older balances, actual receipts and legacy estimates without inventing a category", () => {
    const old = account({ balance: 3012, accruedThrough: "2026-10-10", events: [{ type: "interest", amount: 12, date: "2026-10-01" }], payouts: [{ kind: "actual", date: "2026-10-01", amount: 22.65 }] });
    const result = M.migrateData({ ...emptyData(), accounts: [old] }, "2026-10-18");
    expect(result.accounts[0]).toMatchObject(old); expect(result.accounts[0].productCategory).toBeUndefined();
    expect(M.recordedIncome(result.accounts, undefined, "2026-10-18")).toBe(22.65);
    expect(isAppData(result)).toBe(true);
  });
  it("validates portable category, ISA, bonus and income fields before restoring", () => {
    expect(validProductFields(account({ productCategory: "cash-isa", taxWrapper: "cash-isa", reinvestIncome: true, bonus: { amount: 15.44, expectedDate: "2027-05-06" } }))).toBe(true);
    expect(validDate("2028-02-29")).toBe(true); expect(validDate("2026-02-29")).toBe(false); expect(validDate(null)).toBe(false);
    const invalid = [{ productCategory: "made-up" }, { taxWrapper: "made-up" }, { reinvestIncome: "yes" }, { bonus: null }, { bonus: { amount: Infinity, expectedDate: "2027-05-06" } }, { bonus: { amount: 1, expectedDate: "invalid" } }, { payouts: [{ incomeType: "made-up" }] }];
    for (const value of invalid) expect(isAppData({ ...emptyData(), accounts: [{ ...account(), ...value }] })).toBe(false);
  });
});
