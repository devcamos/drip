import type { Account, Frequency, ProductCategory, RateType, TaxWrapper } from "./types";

export const PROVIDERS: Record<string, string> = {
  Zopa: "#2b2d86", MoneyFarm: "#0f7a6c", Moneybox: "#0f6669", Chip: "#1f6feb", Plum: "#6b2bd9", Trading212: "#0c8ce9",
  Vanguard: "#96151d", Marcus: "#1d2f4f", "Lloyds Bank": "#006a4d", "Premium Bonds": "#3c6e47", Other: "#4a5070",
};
export const TRADING_212_HOLDINGS = ["Realty Income", "Digital Realty", "Prologis", "American Tower", "Brookfield Infrastructure", "Air Products and Chemicals"] as const;
export const displayProvider = (provider: string) => provider === "Trading212" ? "Trading 212" : provider;
type ProductDefaults = { label: string; rateType: RateType; frequency: Frequency; taxWrapper: TaxWrapper; reinvestIncome: boolean };
export const PRODUCTS: Record<ProductCategory, ProductDefaults> = {
  "cash-isa": { label: "Cash ISA", rateType: "interest", frequency: "monthly", taxWrapper: "cash-isa", reinvestIncome: true },
  "cash-lisa": { label: "Cash Lifetime ISA (LISA)", rateType: "interest", frequency: "monthly", taxWrapper: "lifetime-isa", reinvestIncome: true },
  "easy-access": { label: "Easy-access saver", rateType: "interest", frequency: "monthly", taxWrapper: "none", reinvestIncome: true },
  "regular-saver": { label: "Regular saver", rateType: "interest", frequency: "annually", taxWrapper: "none", reinvestIncome: true },
  "current-account": { label: "Current account", rateType: "interest", frequency: "monthly", taxWrapper: "none", reinvestIncome: true },
  "stocks-funds": { label: "Stocks / funds", rateType: "dividend", frequency: "quarterly", taxWrapper: "none", reinvestIncome: false },
  other: { label: "Other / unclassified", rateType: "interest", frequency: "monthly", taxWrapper: "none", reinvestIncome: true },
};
export function productLabel(account: Pick<Account, "productCategory" | "taxWrapper" | "rateType">) {
  if (account.taxWrapper === "stocks-shares-isa") return "Stocks / funds · Stocks & Shares ISA";
  if (account.productCategory) return PRODUCTS[account.productCategory].label;
  return account.rateType === "dividend" ? "Stocks / funds" : "Unclassified account";
}
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
/** Validate new optional fields while preserving older backups without categories. */
export function validProductFields(account: Account): boolean {
  return (account.productCategory === undefined || Object.hasOwn(PRODUCTS, account.productCategory)) &&
    (account.holdingName === undefined || (account.productCategory === "stocks-funds" && typeof account.holdingName === "string" && account.holdingName.trim().length > 0 && account.holdingName.length <= 100)) &&
    (account.taxWrapper === undefined || ["none", "cash-isa", "lifetime-isa", "stocks-shares-isa"].includes(account.taxWrapper)) &&
    (account.reinvestIncome === undefined || typeof account.reinvestIncome === "boolean") &&
    (account.bonus === undefined || (!!account.bonus && Number.isFinite(account.bonus.amount) && account.bonus.amount > 0 && validDate(account.bonus.expectedDate))) &&
    (account.payouts === undefined || (Array.isArray(account.payouts) && account.payouts.every(p => !!p && (p.incomeType === undefined || ["interest", "dividend", "bonus"].includes(p.incomeType)))));
}
