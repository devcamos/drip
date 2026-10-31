import type { Account, StockInvestment } from "./types";

export type InvestmentInputs = { enabled: boolean; shares: string; averagePriceGBP: string; currency: "GBP" | "USD" | "EUR"; originalPrice: string };
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function validInvestment(value: unknown): value is StockInvestment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as StockInvestment;
  return nonNegative(v.shares) && nonNegative(v.averagePriceGBP) && v.shares <= Number.MAX_SAFE_INTEGER &&
    v.averagePriceGBP <= Number.MAX_SAFE_INTEGER / 100 && v.shares * v.averagePriceGBP <= Number.MAX_SAFE_INTEGER / 100 &&
    (v.originalPrice === undefined || (!!v.originalPrice && ["USD", "EUR"].includes(v.originalPrice.currency) && nonNegative(v.originalPrice.averagePrice) && v.originalPrice.averagePrice <= Number.MAX_SAFE_INTEGER / 100));
}
export function investmentInputs(value?: StockInvestment): InvestmentInputs {
  return { enabled: !!value, shares: value ? String(value.shares) : "", averagePriceGBP: value ? String(value.averagePriceGBP) : "", currency: value?.originalPrice?.currency ?? "GBP", originalPrice: value?.originalPrice ? String(value.originalPrice.averagePrice) : "" };
}
/** undefined means opt-out; null is invalid. Never silently turn blanks into zero. */
export function parseInvestment(input: InvestmentInputs): StockInvestment | null | undefined {
  if (!input.enabled) return undefined;
  if (!input.shares.trim() || !input.averagePriceGBP.trim() || (input.currency !== "GBP" && !input.originalPrice.trim())) return null;
  const value: StockInvestment = { shares: Number(input.shares), averagePriceGBP: Number(input.averagePriceGBP),
    ...(input.currency === "GBP" ? {} : { originalPrice: { currency: input.currency, averagePrice: Number(input.originalPrice) } }) };
  return validInvestment(value) ? value : null;
}
/** Capital movement only. Never adds dividends, changes balances or infers FX. */
export function investmentReturn(account: Pick<Account, "balance" | "investment">) {
  if (!validInvestment(account.investment)) return null;
  const cost = account.investment.shares * account.investment.averagePriceGBP;
  const amount = account.balance - cost;
  const percent = cost > 0 ? amount / cost * 100 : NaN;
  return { cost, amount, percent: Number.isFinite(percent) ? percent : null };
}
export const formatShares = (shares: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 12 }).format(shares);
export function averagePriceLabel(investment: StockInvestment) {
  const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(investment.averagePriceGBP);
  return investment.originalPrice ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: investment.originalPrice.currency }).format(investment.originalPrice.averagePrice)} (${gbp})` : gbp;
}
