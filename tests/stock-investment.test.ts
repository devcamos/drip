import { expect, it } from "vitest";
import { averagePriceLabel, formatShares, investmentInputs, investmentReturn, parseInvestment, validInvestment } from "../lib/stock-investment";
import { cloudPayload, fromCloudPayload } from "../lib/cloud-payload";
import { emptyData, isAppData, loadData, saveData } from "../lib/db";
import { rawStore, seedVault } from "./storage-fixtures";
import { dividendPortfolio } from "../lib/dividend-portfolio";
import type { Account } from "../lib/types";
const investment = { shares: 27.25750597, averagePriceGBP: 44.99, originalPrice: { currency: "USD" as const, averagePrice: 60.41 } };
const account: Account = { id: "synthetic-stock", provider: "Trading212", label: "Private nickname", holdingName: "Realty Income", productCategory: "stocks-funds", balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#6b2d83", payouts: [{ date: "2026-10-01", amount: 5.5, kind: "actual" }], createdAt: "2026-10-01", investment };

it("calculates capital return from full-precision shares and GBP cost, independently of yield and dividends", () => {
  const result = investmentReturn(account)!;
  expect(result.cost).toBeCloseTo(1226.3151935903, 8); expect(result.amount).toBeCloseTo(-71.0351935903, 8); expect(result.percent).toBeCloseTo(-5.792572249, 6);
  const changed = { ...account, ratePct: 8, payouts: [{ date: "2026-10-01", amount: 1000, kind: "actual" as const }] };
  expect(investmentReturn(changed)).toEqual(result);
  expect(investmentReturn({ ...account, balance: 1400 })!.amount).toBeGreaterThan(0);
  expect(investmentReturn({ balance: 100, investment: { shares: 2, averagePriceGBP: 0 } })).toEqual({ cost: 0, amount: 100, percent: null });
  expect(investmentReturn({ balance: 10, investment: { shares: 0, averagePriceGBP: 10 } })!.percent).toBeNull();
  expect(investmentReturn({ balance: 1, investment: { shares: Number.MIN_VALUE, averagePriceGBP: 1 } })!.percent).toBeNull();
  expect(investmentReturn({ balance: 1 })).toBeNull();
  const portfolio = dividendPortfolio([account], "2026-10-30");
  expect(portfolio.received).toBe(5.5); expect(portfolio.value).toBe(1155.28); expect(portfolio.annualEstimate).toBeCloseTo(65.85096);
});
it("keeps older accounts valid but rejects malformed investment fields on import", () => {
  expect(isAppData({ ...emptyData(), accounts: [{ ...account, investment: undefined }] })).toBe(true);
  expect(isAppData({ ...emptyData(), accounts: [account] })).toBe(true);
  for (const value of [null, [], {}, { shares: -1, averagePriceGBP: 2 }, { shares: "2", averagePriceGBP: 2 }, { shares: 1, averagePriceGBP: Infinity }, { shares: 1, averagePriceGBP: -1 }, { shares: 1e100, averagePriceGBP: 2 }, { shares: 1e10, averagePriceGBP: 1e10 }, { ...investment, originalPrice: null }, { ...investment, originalPrice: { currency: "ZZZ", averagePrice: 1 } }, { ...investment, originalPrice: { currency: "USD", averagePrice: NaN } }]) {
    expect(validInvestment(value)).toBe(false); expect(isAppData({ ...emptyData(), accounts: [{ ...account, investment: value }] })).toBe(false);
  }
  expect(isAppData({ ...emptyData(), accounts: [{ ...account, rateType: "interest" }] })).toBe(false);
});
it("parses opt-in inputs without treating blanks as zero and round-trips fractional values", () => {
  expect(investmentInputs()).toEqual({ enabled: false, shares: "", averagePriceGBP: "", currency: "GBP", originalPrice: "" });
  expect(parseInvestment(investmentInputs())).toBeUndefined();
  expect(parseInvestment({ ...investmentInputs(), enabled: true })).toBeNull();
  const fields = investmentInputs(investment); expect(parseInvestment(fields)).toEqual(investment);
  for (const patch of [{ shares: " " }, { shares: "-1" }, { averagePriceGBP: "" }, { averagePriceGBP: "Infinity" }, { originalPrice: "" }, { originalPrice: "-1" }]) expect(parseInvestment({ ...fields, ...patch })).toBeNull();
  expect(parseInvestment({ ...fields, currency: "GBP" })).toEqual({ shares: investment.shares, averagePriceGBP: 44.99 });
  expect(parseInvestment(investmentInputs({ shares: 0, averagePriceGBP: 0 }))).toEqual({ shares: 0, averagePriceGBP: 0 });
  expect(formatShares(investment.shares)).toBe("27.25750597"); expect(averagePriceLabel(investment)).toBe("US$60.41 (£44.99)");
  expect(averagePriceLabel({ shares: 1, averagePriceGBP: 10 })).toBe("£10.00");
  expect(averagePriceLabel({ ...investment, originalPrice: { currency: "EUR", averagePrice: 50 } })).toBe("€50.00 (£44.99)");
});
it("preserves only financial investment fields through the encrypted cloud allowlist", () => {
  const data = { ...emptyData(), accounts: [{ ...account, investment: { ...investment, secret: "never portable", originalPrice: { ...investment.originalPrice, privateNote: "never portable" } } }] };
  const portable = cloudPayload(data); expect(portable.accounts[0].investment).toEqual(investment); expect(portable.accounts[0]).not.toHaveProperty("label");
  expect(JSON.stringify(portable)).not.toMatch(/privateNote|never portable|Private nickname/);
  expect(fromCloudPayload(portable as typeof data).accounts[0]).toMatchObject({ investment, label: "" });
  const gbpOnly = cloudPayload({ ...emptyData(), accounts: [{ ...account, investment: { shares: 1, averagePriceGBP: 2 } }] });
  expect(gbpOnly.accounts[0].investment).toEqual({ shares: 1, averagePriceGBP: 2, originalPrice: undefined });
});
it("retains details in actual encrypted IndexedDB and rejects invalid replacement without losing the saved copy", async () => {
  const data = { ...emptyData(), accounts: [account] }; await seedVault(data);
  const loaded = await loadData(); expect(loaded.accounts[0].investment).toEqual(investment);
  const stored = await rawStore(); expect(JSON.stringify(stored.data)).not.toContain("averagePriceGBP");
  await expect(saveData({ ...data, accounts: [{ ...account, investment: { shares: -1, averagePriceGBP: 1 } }] })).rejects.toThrow(/invalid amounts/);
  expect(await loadData()).toEqual(loaded); expect(await rawStore()).toEqual(stored);
});
