import type { Account, MarketValuation } from "./types";
import { convertedHolding, parseFxRate } from "./exchange-rates";
import { validInvestment } from "./stock-investment";

const moneyLimit = Number.MAX_SAFE_INTEGER / 100;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const nonNegativeMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= moneyLimit;
function calendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Historical estimates remain readable: freshness is an application-time check. */
export function validMarketValuation(value: unknown, account?: Pick<Account, "balance" | "rateType" | "investment">): value is MarketValuation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as MarketValuation;
  if (!nonNegativeMoney(v.priceUSD) || v.priceUSD === 0 || typeof v.fxRate !== "number" || !Number.isFinite(v.fxRate) || v.fxRate <= 0 || v.fxRate > 1_000_000 ||
    !nonNegativeMoney(v.recordedBalance) || !calendarDay(v.fxDate) || typeof v.appliedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v.appliedAt) || !Number.isFinite(Date.parse(v.appliedAt)) ||
    !calendarDay(v.appliedAt.slice(0, 10)) || v.fxDate > v.appliedAt.slice(0, 10)) return false;
  if (!account) return true;
  if (account.rateType !== "dividend" || !validInvestment(account.investment)) return false;
  const converted = convertedHolding(String(v.priceUSD), account.investment.shares, v.fxRate);
  return !!converted && roundMoney(converted.valueGBP) === roundMoney(account.balance);
}

export function incomeBalance(account: Pick<Account, "balance"> & Partial<Pick<Account, "marketValuation">>): number {
  return account.marketValuation?.recordedBalance ?? account.balance;
}

/** No quote API is implied: the user supplies a USD price; FX must be recent. */
export function applyMarketValuation(account: Account, input: { priceUSD: number; fxRate: number; fxDate: string }, appliedAt = Date.now()): Account {
  if (account.productCategory === "credit-card" || account.rateType !== "dividend" || !validInvestment(account.investment) ||
    !nonNegativeMoney(input.priceUSD) || input.priceUSD === 0 || !Number.isFinite(appliedAt)) throw new Error("Enter a valid share price for a recorded dividend holding.");
  const fx = parseFxRate({ base: "USD", quote: "GBP", rate: input.fxRate, date: input.fxDate, source: "Frankfurter" }, "USD", appliedAt);
  const converted = fx && convertedHolding(String(input.priceUSD), account.investment.shares, fx.rate);
  if (!converted) throw new Error("Use a recent USD to GBP exchange rate before applying this price.");
  const at = new Date(appliedAt).toISOString();
  const balance = roundMoney(converted.valueGBP);
  const value: Account = { ...account, balance, marketValuation: {
    priceUSD: input.priceUSD, fxRate: fx!.rate, fxDate: fx!.date, appliedAt: at, recordedBalance: incomeBalance(account),
  }, events: [...(account.events ?? []), { type: "set", date: at.slice(0, 10), amount: balance }] };
  if (!validMarketValuation(value.marketValuation, value)) throw new Error("Could not apply this holding value. Your saved figures are unchanged.");
  return value;
}

/** Restore the original provider balance without changing cost or cash income. */
export function clearMarketValuation(account: Account, at = Date.now()): Account {
  if (!account.marketValuation) return account;
  const { marketValuation, ...rest } = account;
  return { ...rest, balance: marketValuation.recordedBalance, events: [...(account.events ?? []), { type: "set", date: new Date(at).toISOString().slice(0, 10), amount: marketValuation.recordedBalance }] };
}
