import type { Identity } from "./identity";
export interface CloudState { userId: string; key: CryptoKey; version: number; dirty: boolean; lastSyncAt: string | null; identityId: string; generation: string; revision: number }
export type Frequency = "daily" | "monthly" | "quarterly" | "annually";
export type RateType = "interest" | "dividend";

export interface Payout { date: string; amount: number; kind: "expected" | "actual" }

export interface BalanceEvent { type: "topup" | "withdraw" | "set" | "interest"; date: string; amount: number }
export interface RatePeriod { from: string; ratePct: number } // rate in force from this date

export interface Account {
  id: string;
  provider: string;      // e.g. "Zopa"
  label: string;         // device nickname: excluded from cloud sync; explicit file exports retain it
  balance: number;       // GBP
  ratePct: number;       // annual %, e.g. 7
  rateType: RateType;
  frequency: Frequency;
  nextPayoutDate: string; // YYYY-MM-DD
  colour: string;
  payouts: Payout[];
  events?: BalanceEvent[]; // top-ups, withdrawals and manual balance updates
  accruedThrough?: string; // daily accounts: interest credited for every day before this date
  rateHistory?: RatePeriod[]; // sorted by from; ratePct mirrors the rate in force today
  createdAt: string;
}

/** Month-end total balance snapshot, keyed by YYYY-MM. */
export interface Snapshot { month: string; totalBalance: number; monthlyIncome: number; deposits?: number; withdrawals?: number }

export interface LockSettings { credentialId: string | null; enabledAt: string | null }
export interface AppData { version: 1; accounts: Account[]; snapshots: Snapshot[]; lastBackupAt: string | null; projection?: { monthlyDeposit: number; years: number }; lock?: LockSettings; identity?: Identity }
