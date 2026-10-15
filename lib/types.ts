export type Frequency = "monthly" | "quarterly" | "annually";
export type RateType = "interest" | "dividend";

export interface Payout { date: string; amount: number; kind: "expected" | "actual" }

export interface Account {
  id: string;
  provider: string;      // e.g. "Zopa"
  label: string;         // nickname, stays on device
  balance: number;       // GBP
  ratePct: number;       // annual %, e.g. 7
  rateType: RateType;
  frequency: Frequency;
  nextPayoutDate: string; // YYYY-MM-DD
  colour: string;
  payouts: Payout[];
  createdAt: string;
}

/** Month-end total balance snapshot, keyed by YYYY-MM. */
export interface Snapshot { month: string; totalBalance: number; monthlyIncome: number }

export interface AppData { version: 1; accounts: Account[]; snapshots: Snapshot[]; lastBackupAt: string | null }
