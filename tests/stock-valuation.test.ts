import { expect, test } from "vitest";
import { estimateStockValue, sampleStockHolding, validSharePrice } from "../app/prototype/welcome/stock-valuation";
import type { FxRate } from "../lib/exchange-rates";

const now = Date.parse("2026-11-07T12:00:00Z");
const fx: FxRate = { base: "USD", quote: "GBP", rate: 0.75, date: "2026-11-06", source: "Frankfurter" };

test("fractional shares convert without rounding the per-share price first", () => {
  const value = estimateStockValue({ priceUSD: "60.41", fx: { ...fx, rate: 0.74821 } }, { shares: 27.25750597, averagePriceGBP: 44.99 }, now)!;
  expect(value.perShareGBP).toBeCloseTo(45.1993661, 8);
  expect(value.valueGBP).toBeCloseTo(27.25750597 * 60.41 * 0.74821, 8);
});

test("capital gain, loss and zero cost use acquisition cost rather than the recorded value", () => {
  expect(estimateStockValue({ priceUSD: "80", fx }, sampleStockHolding, now)?.capital).toEqual({ cost: 2400, amount: 600, percent: 25 });
  expect(estimateStockValue({ priceUSD: "60", fx }, sampleStockHolding, now)?.capital).toEqual({ cost: 2400, amount: -150, percent: -6.25 });
  expect(estimateStockValue({ priceUSD: "60", fx }, { shares: 1, averagePriceGBP: 0 }, now)?.capital.percent).toBeNull();
});

test("manual prices accept positive decimals and reject ambiguous, missing or excessive numbers", () => {
  for (const price of ["60", "60.", ".5", " 60.50 "]) expect(validSharePrice(price)).toBe(true);
  for (const price of ["", " ", "0", "-1", "1e2", "0x10", "$60", "60,00", "NaN", "Infinity", "1.12345678901", "9007199254740991"]) {
    expect(validSharePrice(price)).toBe(false);
    expect(estimateStockValue({ priceUSD: price, fx }, sampleStockHolding, now)).toBeNull();
  }
});

test("unsafe quantities, acquisition costs and total values cannot reach the money overview", () => {
  for (const holding of [{ shares: -1, averagePriceGBP: 1 }, { shares: NaN, averagePriceGBP: 1 }, { shares: 1, averagePriceGBP: -1 }, { shares: 1, averagePriceGBP: Infinity }, { shares: 1e14, averagePriceGBP: 1 }, { shares: 1e12, averagePriceGBP: 0 }]) {
    expect(estimateStockValue({ priceUSD: "1000", fx }, holding, now)).toBeNull();
  }
});

test("missing, wrong-currency, malformed, future or stale FX leaves the recorded value as fallback", () => {
  expect(estimateStockValue(null, sampleStockHolding, now)).toBeNull();
  for (const rate of [{ ...fx, base: "EUR" }, { ...fx, quote: "USD" }, { ...fx, rate: 0 }, { ...fx, rate: Infinity }, { ...fx, date: "2026-02-31" }, { ...fx, date: "2026-11-08" }, { ...fx, date: "2026-10-30" }]) {
    expect(estimateStockValue({ priceUSD: "60", fx: rate as FxRate }, sampleStockHolding, now)).toBeNull();
  }
  expect(estimateStockValue({ priceUSD: "60", fx: { ...fx, date: "2026-10-31" } }, sampleStockHolding, now)).not.toBeNull();
});

test("validated FX retains its provider date and strips unrelated response fields", () => {
  const value = estimateStockValue({ priceUSD: "60", fx: { ...fx, extra: "not included" } as FxRate }, sampleStockHolding, now)!;
  expect(value.fx).toEqual(fx);
  expect(value.priceUSD).toBe(60);
  expect(value.valueGBP).toBe(2250);
});

test("revaluation is immutable and cannot turn price movement into dividend income", () => {
  const input = Object.freeze({ priceUSD: "80", fx: Object.freeze({ ...fx }) });
  const before = structuredClone(sampleStockHolding);
  const result = estimateStockValue(input, sampleStockHolding, now)!;
  expect(result.valueGBP).toBe(3000);
  expect(sampleStockHolding).toEqual(before);
  expect(sampleStockHolding.annualIncomeGBP).toBe(135);
  expect(sampleStockHolding.recordedValueGBP).toBe(2500);
  expect(result).not.toHaveProperty("annualIncomeGBP");
});
