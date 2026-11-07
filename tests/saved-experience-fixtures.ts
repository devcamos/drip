import type { Account, AppData } from "../lib/types";

export const releaseIdentity = { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "release_test", createdAt: "2026-11-01" };
const common = { label: "", rateType: "interest" as const, ratePct: 0, frequency: "monthly" as const, nextPayoutDate: "2026-11-20", colour: "#6b2d83", payouts: [], events: [], createdAt: "2026-11-01" };

export function releaseSaver(changes: Partial<Account> = {}): Account {
  return { ...common, id: "cash", provider: "Zopa", productCategory: "easy-access", balance: 5000, ratePct: 4.1, ...changes };
}
export function releaseStock(changes: Partial<Account> = {}): Account {
  return { ...common, id: "stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", balance: 2500, rateType: "dividend", ratePct: 5.4, investment: { shares: 50, averagePriceGBP: 48 }, ...changes };
}
export function releaseDebt(changes: Partial<Account> = {}): Account {
  return { ...common, id: "credit", provider: "Barclaycard", productCategory: "credit-card", balance: 1200, creditCard: { apr: 24.9, minimumPayment: 35, plannedPayment: 75 }, ...changes };
}
export function releaseData(accounts: Account[] = [releaseSaver(), releaseStock(), releaseDebt()]): AppData {
  return { version: 1, accounts, snapshots: [], lastBackupAt: null, identity: { ...releaseIdentity } };
}
export function releaseHoldingsAndDebts(): Account[] {
  return [releaseSaver(), releaseStock(), releaseStock({ id: "stock-2", holdingName: "Digital Realty", balance: 2000, ratePct: 3.2, investment: { shares: 20, averagePriceGBP: 90 } }), releaseDebt(), releaseDebt({ id: "credit-2", provider: "Lloyds", balance: 600, nextPayoutDate: "2026-11-25", creditCard: { apr: 19.9, minimumPayment: 20, plannedPayment: 50 } })];
}
