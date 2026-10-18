import type { Identity } from "./identity";
export interface CloudState { userId: string; key: CryptoKey; version: number; dirty: boolean; lastSyncAt: string | null; identityId: string; generation: string; revision: number }
export type Frequency = "daily" | "monthly" | "quarterly" | "annually";
export type RateType = "interest" | "dividend";
export type ProductCategory = "cash-isa" | "easy-access" | "regular-saver" | "current-account" | "stocks-funds" | "other";
export type TaxWrapper = "none" | "cash-isa" | "stocks-shares-isa";
export type IncomeType = RateType | "bonus";
export interface PendingBonus { amount: number; expectedDate: string }

export interface Payout { date: string; amount: number; kind: "expected" | "actual"; incomeType?: IncomeType }

export interface BalanceEvent { type: "topup" | "withdraw" | "set" | "interest"; date: string; amount: number }
export interface RatePeriod { from: string; ratePct: number } // rate in force from this date

export interface Account {
  id: string;
  provider: string;      // e.g. "Zopa"
  label: string;         // device nickname: excluded from cloud sync; explicit file exports retain it
  balance: number;       // GBP
  ratePct: number;       // annual %, e.g. 7
  rateType: RateType;
  productCategory?: ProductCategory; // absent on older accounts; never infer ISA status from a provider
  taxWrapper?: TaxWrapper;
  reinvestIncome?: boolean; // forecast assumption only; recorded income never changes the saved balance
  bonus?: PendingBonus;
  frequency: Frequency;
  nextPayoutDate: string; // YYYY-MM-DD
  colour: string;
  payouts: Payout[];
  events?: BalanceEvent[]; // top-ups, withdrawals and manual balance updates
  accruedThrough?: string; // legacy estimate history only; estimates no longer change balances
  rateHistory?: RatePeriod[]; // sorted by from; ratePct mirrors the rate in force today
  createdAt: string;
}

/** Month-end total balance snapshot, keyed by YYYY-MM. */
export interface Snapshot { month: string; totalBalance: number; monthlyIncome: number; deposits?: number; withdrawals?: number }

export interface LockSettings { credentialId: string | null; enabledAt: string | null }
export interface AppData { version: 1; accounts: Account[]; snapshots: Snapshot[]; lastBackupAt: string | null; projection?: { monthlyDeposit: number; years: number }; lock?: LockSettings; identity?: Identity }
