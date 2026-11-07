import type { Account, BalanceEvent, MarketValuation } from "./types";
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

type ValuedAccount = Pick<Account, "balance" | "events"> & Partial<Pick<Account, "investment" | "marketValuation">>;
function anchor(events: BalanceEvent[], value: MarketValuation, quote: number) {
  return events.findLastIndex(event => event?.type === "set" && event.date === value.appliedAt.slice(0, 10) && event.amount === quote);
}
/** Array order records when an entry was saved, including backdated transfers. */
function transfers(account: Pick<Account, "balance" | "events">, value: MarketValuation, quote: number): number | null {
  if (account.events !== undefined && !Array.isArray(account.events)) return null;
  const events = account.events ?? [], start = anchor(events, value, quote);
  if (start < 0) return roundMoney(account.balance) === quote ? 0 : null;
  let pennies = 0;
  for (const event of events.slice(start + 1)) {
    if (!event || !["topup", "withdraw"].includes(event.type) || !nonNegativeMoney(event.amount) || !calendarDay(event.date)) return null;
    pennies += Math.round(event.amount * 100) * (event.type === "topup" ? 1 : -1);
    if (!Number.isSafeInteger(pennies)) return null;
  }
  return pennies / 100;
}

/** Cash changes affect recorded principal, never promote an earlier price gain. */
export function applyValuationTransfer<T extends ValuedAccount>(account: T, type: "topup" | "withdraw", date: string, amount: number): T {
  const value = account.marketValuation;
  const converted = value && account.investment && convertedHolding(String(value.priceUSD), account.investment.shares, value.fxRate);
  if (!value || !converted || !nonNegativeMoney(amount) || !calendarDay(date)) throw new Error("Could not record this holding transfer. Your saved figures are unchanged.");
  const change = roundMoney(amount) * (type === "topup" ? 1 : -1);
  const balance = roundMoney(account.balance + change);
  const recordedBalance = roundMoney(Math.max(0, value.recordedBalance + change));
  if (!nonNegativeMoney(recordedBalance) || !nonNegativeMoney(balance)) throw new Error("This transfer exceeds the supported holding value.");
  const quote = roundMoney(converted.valueGBP), events = account.events ?? [];
  const history: BalanceEvent[] = anchor(events, value, quote) >= 0 ? events : [...events, { type: "set", date: value.appliedAt.slice(0, 10), amount: quote }];
  return { ...account, balance, marketValuation: { ...value, recordedBalance }, events: [...history, { type, date, amount: roundMoney(amount) }] };
}

export function hasValuationTransfers(account: Account): boolean {
  const value = account.marketValuation;
  const converted = value && account.investment && convertedHolding(String(value.priceUSD), account.investment.shares, value.fxRate);
  return !!(value && converted && transfers(account, value, roundMoney(converted.valueGBP)));
}

/** Historical estimates remain readable: freshness is an application-time check. */
export function validMarketValuation(value: unknown, account?: Pick<Account, "balance" | "rateType" | "investment" | "events">): value is MarketValuation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as MarketValuation;
  if (!nonNegativeMoney(v.priceUSD) || v.priceUSD === 0 || typeof v.fxRate !== "number" || !Number.isFinite(v.fxRate) || v.fxRate <= 0 || v.fxRate > 1_000_000 ||
    !nonNegativeMoney(v.recordedBalance) || !calendarDay(v.fxDate) || typeof v.appliedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v.appliedAt) || !Number.isFinite(Date.parse(v.appliedAt)) ||
    !calendarDay(v.appliedAt.slice(0, 10)) || v.fxDate > v.appliedAt.slice(0, 10)) return false;
  if (!account) return true;
  if (!nonNegativeMoney(account.balance) || account.rateType !== "dividend" || !validInvestment(account.investment)) return false;
  const converted = convertedHolding(String(v.priceUSD), account.investment.shares, v.fxRate);
  if (!converted) return false;
  const quote = roundMoney(converted.valueGBP), transferred = transfers(account, v, quote);
  return transferred !== null && roundMoney(quote + transferred) === roundMoney(account.balance);
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
