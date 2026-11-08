import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addExample, portfolioSummary, samplePortfolio, updateCredit, updateStockPrice, type DemoAccount, type DemoStock } from "../app/prototype/welcome/demo-accounts";
import type { FxRate } from "../lib/exchange-rates";

const now = Date.parse("2026-11-07T12:00:00Z");
const fx: FxRate = { base: "USD", quote: "GBP", rate: 0.75, date: "2026-11-06", source: "Frankfurter" };
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(now));
afterEach(() => vi.restoreAllMocks());

test("new demo portfolios have independent holding and statement objects", () => {
  const first = samplePortfolio(), second = samplePortfolio();
  expect(portfolioSummary(first)).toEqual({ money: 7500, debt: 1200, netPosition: 6300, annualIncome: 340, monthlyIncome: 28.33, cash: 1, stocks: 1, credits: 1, estimated: false });
  const card = first.find(account => account.kind === "credit")!;
  card.card.balance = 1;
  expect(portfolioSummary(second).debt).toBe(1200);
  expect((first[1] as DemoStock).holding).not.toBe((second[1] as DemoStock).holding);
});

test("adding multiple stocks and debts preserves every existing account and distinct market identity", () => {
  const original = samplePortfolio(), snapshot = structuredClone(original);
  let accounts = addExample(original, "stock").accounts;
  expect(accounts.at(-1)).toMatchObject({ id: "stock-2", name: "Digital Realty", instrumentId: "digital-realty" });
  accounts = addExample(accounts, "credit").accounts;
  for (let index = 0; index < 8; index += 1) accounts = addExample(addExample(accounts, "stock").accounts, "credit").accounts;
  expect(original).toEqual(snapshot);
  expect(new Set(accounts.map(account => account.id)).size).toBe(accounts.length);
  expect(portfolioSummary(accounts)).toMatchObject({ stocks: 10, credits: 10 });
  expect(accounts.some(account => account.name === "Realty Income · Holding 7")).toBe(true);
  expect(accounts.slice(0, 3)).toEqual(original);
});

test("additional savers and a previously used identifier cannot replace an account", () => {
  const existing = samplePortfolio();
  existing[1] = { ...existing[1], id: "cash-2" };
  const added = addExample(existing, "cash");
  expect(added.account).toMatchObject({ id: "cash-3", name: "Savings 2", balance: 1000 });
  expect(added.accounts).toHaveLength(4);
  expect(portfolioSummary(added.accounts)).toMatchObject({ money: 8500, annualIncome: 375, cash: 2 });
});

test("statement edits target one debt account and never change a holding or another credit card", () => {
  const accounts = addExample(samplePortfolio(), "credit").accounts;
  const next = { balance: 900, apr: 0, minimumPayment: 30, plannedPayment: 60, paymentDate: "2026-11-29" };
  const updated = updateCredit(accounts, "credit-2", next);
  next.balance = 1;
  expect(portfolioSummary(updated)).toMatchObject({ money: 7500, debt: 2100, netPosition: 5400, annualIncome: 340 });
  expect(updated.slice(0, 3)).toEqual(accounts.slice(0, 3));
  expect(updated.at(-1)).toMatchObject({ card: { balance: 900, apr: 0, minimumPayment: 30 } });
  expect(updateCredit(accounts, "stock", next)).toEqual(accounts);
  expect(updateCredit(accounts, "missing", next)).toEqual(accounts);
});

test("a price and currency rate belong to one holding, including reset to its own recorded value", () => {
  const accounts = addExample(samplePortfolio(), "stock").accounts;
  const input = { priceUSD: "100", fx: { ...fx } };
  const updated = updateStockPrice(accounts, "stock-2", input);
  input.fx.rate = 1;
  expect(portfolioSummary(updated)).toMatchObject({ money: 9000, annualIncome: 404, monthlyIncome: 33.67, estimated: true });
  expect(updated[1]).toEqual(accounts[1]);
  expect(portfolioSummary(updateStockPrice(updated, "stock-2", null)).money).toBe(9500);
  expect(updateStockPrice(accounts, "credit", input)).toEqual(accounts);
  expect(updateStockPrice(accounts, "missing", input)).toEqual(accounts);
});

test("aggregates use pennies across accounts, preserve negative net positions and handle an empty collection", () => {
  const accounts: DemoAccount[] = [
    { id: "a", kind: "cash", name: "A", balance: 0.1, ratePct: 0 },
    { id: "b", kind: "cash", name: "B", balance: 0.2, ratePct: 0 },
    { id: "c", kind: "credit", name: "C", card: { balance: 0.4, apr: 0, minimumPayment: 0, paymentDate: "2026-11-20" } },
  ];
  expect(portfolioSummary(accounts)).toMatchObject({ money: 0.3, debt: 0.4, netPosition: -0.1, annualIncome: 0 });
  expect(portfolioSummary([])).toEqual({ money: 0, debt: 0, netPosition: 0, annualIncome: 0, monthlyIncome: 0, cash: 0, stocks: 0, credits: 0, estimated: false });
});

test("stale prices fall back per holding and market movement never becomes dividend income", () => {
  const accounts = addExample(samplePortfolio(), "stock").accounts;
  const original = structuredClone(accounts);
  let updated = updateStockPrice(accounts, "stock", { priceUSD: "80", fx });
  updated = updateStockPrice(updated, "stock-2", { priceUSD: "100", fx: { ...fx, date: "2020-01-01" } });
  expect(portfolioSummary(updated)).toMatchObject({ money: 10000, debt: 1200, netPosition: 8800, annualIncome: 404, monthlyIncome: 33.67, estimated: true });
  expect(portfolioSummary(updated, now + 8 * 86400000)).toMatchObject({ money: 9500, annualIncome: 404, estimated: false });
  expect(accounts).toEqual(original);
});
