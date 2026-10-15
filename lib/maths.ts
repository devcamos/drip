import type { Account, BalanceEvent, Frequency, Snapshot } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Expected income per month: balance × rate ÷ 12. */
export function monthlyIncome(balance: number, ratePct: number): number {
  if (!(balance > 0) || !(ratePct > 0)) return 0;
  return (balance * ratePct) / 100 / 12;
}

const PER_YEAR: Record<Frequency, number> = { monthly: 12, quarterly: 4, annually: 1 };

/** Amount paid at each payout for the account's frequency. */
export function payoutAmount(a: Pick<Account, "balance" | "ratePct" | "frequency">): number {
  return (monthlyIncome(a.balance, a.ratePct) * 12) / PER_YEAR[a.frequency];
}

export function totalBalance(accts: Pick<Account, "balance">[]): number {
  return accts.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0);
}

export function totalMonthlyIncome(accts: Pick<Account, "balance" | "ratePct">[]): number {
  return accts.reduce((s, a) => s + monthlyIncome(a.balance, a.ratePct), 0);
}

/** Σ(balance × rate) ÷ Σ balance, as a %. */
export function weightedYield(accts: Pick<Account, "balance" | "ratePct">[]): number {
  const total = totalBalance(accts);
  if (total === 0) return 0;
  const w = accts.reduce((s, a) => s + (a.balance > 0 ? a.balance * Math.max(a.ratePct, 0) : 0), 0);
  return w / total;
}

/** Month-on-month growth of total balance as a %, or null if not enough history. */
export function momGrowth(snaps: Snapshot[]): number | null {
  const s = [...snaps].sort((a, b) => a.month.localeCompare(b.month));
  if (s.length < 2) return null;
  const prev = s[s.length - 2].totalBalance, cur = s[s.length - 1].totalBalance;
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** 12-month projection, compounding each account monthly, interest reinvested. */
export function projection(accts: Pick<Account, "balance" | "ratePct">[], months = 12): { month: number; balance: number }[] {
  const out: { month: number; balance: number }[] = [];
  for (let m = 1; m <= months; m++) {
    const b = accts.reduce((s, a) => {
      if (!(a.balance > 0)) return s;
      const r = Math.max(a.ratePct, 0) / 100 / 12;
      return s + a.balance * Math.pow(1 + r, m);
    }, 0);
    out.push({ month: m, balance: b });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

/** Add months, clamping to month end (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return ymd(target);
}

/** Roll a payout date forward until it is today or later. */
export function nextPayout(date: string, freq: Frequency, today: string): string {
  const step = 12 / PER_YEAR[freq];
  let d = date, i = 0;
  while (d < today && i < 1000) { i++; d = addMonths(date, step * i); }
  return d;
}

/** Upcoming payouts across accounts within `days`, soonest first. */
export function upcoming(accts: Account[], today: string, days = 31) {
  const [y, m, d] = today.split("-").map(Number);
  const end = ymd(new Date(Date.UTC(y, m - 1, d + days)));
  return accts
    .map((a) => ({ account: a, date: nextPayout(a.nextPayoutDate, a.frequency, today), amount: payoutAmount(a) }))
    .filter((p) => p.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Insert/replace the snapshot for the current month. */
export function upsertSnapshot(snaps: Snapshot[], accts: Account[], now: Date): Snapshot[] {
  const key = monthKey(now);
  const snap: Snapshot = { month: key, totalBalance: round2(totalBalance(accts)), monthlyIncome: round2(totalMonthlyIncome(accts)), deposits: round2(depositsInMonth(accts, key)) };
  return [...snaps.filter((s) => s.month !== key), snap].sort((a, b) => a.month.localeCompare(b.month));
}

/** True when a backup reminder should show (never backed up, or older than `days`). */
export function backupDue(lastBackupAt: string | null, hasData: boolean, now: Date, days = 14): boolean {
  if (!hasData) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > days * 86400000;
}

export const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

const DAY = 86400000;
const t = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/**
 * Interest earned between `start` (inclusive) and `end` (exclusive), compounding daily
 * at an annual rate, with top-ups applied on their date. Interest before a top-up uses
 * the old balance; after it, compounding continues from the new amount.
 */
export function periodGrowth(opening: number, ratePct: number, topups: Pick<BalanceEvent, "date" | "amount">[], start: string, end: string) {
  const daily = Math.max(ratePct, 0) / 100 / 365;
  const inRange = topups.filter((x) => x.date >= start && x.date < end && x.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  let bal = Math.max(opening, 0), cursor = t(start), deposits = 0;
  const grow = (to: number) => { const days = Math.max(0, Math.round((to - cursor) / DAY)); bal *= Math.pow(1 + daily, days); cursor = to; };
  for (const x of inRange) { grow(t(x.date)); bal += x.amount; deposits += x.amount; }
  grow(t(end));
  const closing = bal;
  return { opening: Math.max(opening, 0), deposits, interest: closing - Math.max(opening, 0) - deposits, closing };
}

/** Apply a top-up: adds to balance and logs the event. */
export function applyTopUp<A extends Pick<Account, "balance" | "events">>(a: A, amount: number, date: string): A {
  if (!(amount > 0)) throw new Error("Top-up must be more than £0");
  return { ...a, balance: round2(a.balance + amount), events: [...(a.events ?? []), { type: "topup", date, amount: round2(amount) }] };
}

/** Manual balance update (e.g. read from the provider app); logged, not counted as a deposit. */
export function applySetBalance<A extends Pick<Account, "balance" | "events">>(a: A, balance: number, date: string): A {
  if (!(balance >= 0)) throw new Error("Balance can't be negative");
  return { ...a, balance: round2(balance), events: [...(a.events ?? []), { type: "set", date, amount: round2(balance) }] };
}

/** Sum of top-ups across accounts in a YYYY-MM month. */
export function depositsInMonth(accts: Pick<Account, "events">[], month: string): number {
  return accts.reduce((s, a) => s + (a.events ?? []).filter((e) => e.type === "topup" && e.date.startsWith(month)).reduce((x, e) => x + e.amount, 0), 0);
}

/** Split last month-on-month change into top-ups vs growth (interest/other). Null without history. */
export function momBreakdown(snaps: Snapshot[]): { change: number; deposits: number; growth: number; growthPct: number } | null {
  const s = [...snaps].sort((a, b) => a.month.localeCompare(b.month));
  if (s.length < 2) return null;
  const prev = s[s.length - 2], cur = s[s.length - 1];
  if (prev.totalBalance <= 0) return null;
  const change = cur.totalBalance - prev.totalBalance, deposits = cur.deposits ?? 0, growth = change - deposits;
  return { change, deposits, growth, growthPct: (growth / prev.totalBalance) * 100 };
}
