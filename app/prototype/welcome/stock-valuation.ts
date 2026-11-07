import { convertedHolding, parseFxRate, type FxRate } from "@/lib/exchange-rates";
import { investmentReturn, validInvestment } from "@/lib/stock-investment";

export const sampleStockHolding = Object.freeze({ shares: 50, averagePriceGBP: 48, recordedValueGBP: 2500, annualIncomeGBP: 135 });
export type StockPriceInput = Readonly<{ priceUSD: string; fx: FxRate }>;
export type ValuedHolding = Readonly<{ shares: number; averagePriceGBP: number }>;

/** Explicit user input, never a quote extracted from an embedded market chart. */
export function validSharePrice(price: string) {
  return /^(?:\d+(?:\.\d{0,10})?|\.\d{1,10})$/.test(price.trim()) && Number(price) > 0 && Number(price) <= Number.MAX_SAFE_INTEGER / 100;
}

/** Market estimate only. Acquisition cost and cash income never follow price movement. */
export function estimateStockValue(input: StockPriceInput | null, holding: ValuedHolding = sampleStockHolding, now = Date.now()) {
  if (!input || !validSharePrice(input.priceUSD) || !validInvestment(holding)) return null;
  const fx = parseFxRate(input.fx, "USD", now);
  if (!fx) return null;
  const converted = convertedHolding(input.priceUSD, holding.shares, fx.rate);
  if (!converted) return null;
  const capital = investmentReturn({ balance: converted.valueGBP, investment: holding });
  return { ...converted, priceUSD: Number(input.priceUSD), fx, capital: capital! };
}
