import { validDate } from "./products";
import type { Account, AppData, BalanceEvent, Frequency, RatePeriod, Snapshot, IncomeType, Payout } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Expected income per month: balance × rate ÷ 12. */
export function monthlyIncome(balance: number, ratePct: number): number {
  if (!(balance > 0) || !(ratePct > 0)) return 0;
  return (balance * ratePct) / 100 / 12;
}

const PER_YEAR: Record<Frequency, number> = { daily: 365, monthly: 12, quarterly: 4, annually: 1 };

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

/** The previous and current month snapshots, or null when there is not enough usable history. */
function lastTwoSnapshots(snaps: Snapshot[]): [prev: Snapshot, cur: Snapshot] | null {
  const s = [...snaps].sort((a, b) => a.month.localeCompare(b.month));
  if (s.length < 2) return null;
  const prev = s[s.length - 2];
  if (prev.totalBalance <= 0) return null;
  return [prev, s[s.length - 1]];
}

/** Month-on-month growth of total balance as a %, or null if not enough history. */
export function momGrowth(snaps: Snapshot[]): number | null {
  const pair = lastTwoSnapshots(snaps);
  if (!pair) return null;
  const [prev, cur] = pair;
  return ((cur.totalBalance - prev.totalBalance) / prev.totalBalance) * 100;
}

type ForecastAccount = Pick<Account, "balance" | "ratePct"> & Partial<Pick<Account, "rateType" | "reinvestIncome" | "bonus">>;
/** Monthly forecast only: never writes estimates into saved accounts or recorded income. */
export function projection(accts: ForecastAccount[], months = 12, monthlyDeposit = 0, today = ymd(new Date())) {
  const total = totalBalance(accts);
  const holdings = accts.map(a => ({ account: a, balance: Math.max(a.balance, 0), share: total > 0 ? Math.max(a.balance, 0) / total : 0, bonusApplied: false }));
  const out: { month: number; balance: number; income: number }[] = [];
  let cash = 0, income = 0;
  for (let month = 1; month <= months; month++) {
    const end = addMonths(today, month);
    for (const holding of holdings) {
      const a = holding.account;
      let earned = monthlyIncome(holding.balance, a.ratePct);
      if (a.bonus && !holding.bonusApplied && a.bonus.expectedDate >= today && a.bonus.expectedDate <= end) {
        earned += a.bonus.amount; holding.bonusApplied = true;
      }
      income += earned;
      if (a.reinvestIncome ?? a.rateType !== "dividend") holding.balance += earned;
      holding.balance += monthlyDeposit * holding.share;
    }
    if (total === 0) cash += monthlyDeposit;
    out.push({ month, balance: holdings.reduce((sum, h) => sum + h.balance, cash), income });
  }
  return out;
}

/** Actual payments only, by receipt date. Balance changes and legacy estimates are never income. */
export function recordedIncome(accts: Pick<Account, "payouts">[], month?: string, asOf = ymd(new Date())): number {
  return accts.reduce((sum, a) => sum + a.payouts.filter(p => p.kind === "actual" && p.date <= asOf && (!month || p.date.startsWith(month)) && Number.isFinite(p.amount) && p.amount > 0).reduce((n, p) => n + p.amount, 0), 0);
}

export function pendingBonuses(accts: Pick<Account, "bonus">[]): number {
  return accts.reduce((sum, a) => sum + (a.bonus?.amount ?? 0), 0);
}

/** Recording a payment does not assume it is missing from the user's confirmed balance. */
export function recordIncome(a: Account, amount: number, date: string, incomeType: IncomeType): Account {
  if (!Number.isFinite(amount) || round2(amount) <= 0) throw new Error("Income must be at least £0.01.");
  if (!validDate(date)) throw new Error("Enter a valid payment date.");
  const payout: Payout = { date, amount: round2(amount), kind: "actual", incomeType };
  return { ...a, payouts: [...a.payouts, payout], bonus: incomeType === "bonus" ? undefined : a.bonus };
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
  if (freq === "daily") return today;
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
    .filter((a) => a.frequency !== "daily")
    .map((a) => ({ account: a, date: nextPayout(a.nextPayoutDate, a.frequency, today), amount: payoutAmount(a) }))
    .filter((p) => p.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Insert/replace the snapshot for the current month. */
export function upsertSnapshot(snaps: Snapshot[], accts: Account[], now: Date): Snapshot[] {
  const key = monthKey(now);
  const snap: Snapshot = { month: key, totalBalance: round2(totalBalance(accts)), monthlyIncome: round2(totalMonthlyIncome(accts)), deposits: round2(depositsInMonth(accts, key)), withdrawals: round2(withdrawalsInMonth(accts, key)) };
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

/** Rate in force on `date` (latest period whose `from` <= date; earliest period if before all). */
export function rateOn(history: RatePeriod[], date: string): number {
  return rateOnSorted(sortRates(history), date);
}

const sortRates = (history: RatePeriod[]) => [...history].sort((a, b) => a.from.localeCompare(b.from));

/** rateOn for history already sorted by `from`; lets hot loops sort once instead of every call. */
function rateOnSorted(h: RatePeriod[], date: string): number {
  if (h.length === 0) return 0;
  let r = h[0].ratePct;
  for (const p of h) if (p.from <= date) r = p.ratePct;
  return r;
}

/**
 * Daily-compounding accrual from `start` (inclusive) to `end` (exclusive).
 * Each day uses the rate in force that day. Top-ups and withdrawals apply on their date,
 * so interest before them uses the old balance and compounding continues from the new one.
 */
export function accrue(opening: number, rates: number | RatePeriod[], events: Pick<BalanceEvent, "type" | "date" | "amount">[], start: string, end: string) {
  // Sorted once here: rateOn is called for every day in the period.
  const hist = sortRates(typeof rates === "number" ? [{ from: "0000-01-01", ratePct: rates }] : rates);
  const evs = events.filter((x) => (x.type === "topup" || x.type === "withdraw") && x.date >= start && x.date < end && x.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = Math.max(opening, 0);
  let bal = open, deposits = 0, withdrawals = 0, interest = 0, i = 0;
  for (let day = t(start); day < t(end); day += DAY) {
    const d = ymd(new Date(day));
    for (; i < evs.length && evs[i].date === d; i++) {
      if (evs[i].type === "topup") { bal += evs[i].amount; deposits += evs[i].amount; }
      else { const w = Math.min(evs[i].amount, bal); bal -= w; withdrawals += w; }
    }
    const inc = bal * (Math.max(rateOnSorted(hist, d), 0) / 100 / 365);
    bal += inc; interest += inc;
  }
  return { opening: open, deposits, withdrawals, interest, closing: bal };
}

/** Back-compatible wrapper: top-ups only, single or historical rate. */
export function periodGrowth(opening: number, rates: number | RatePeriod[], topups: Pick<BalanceEvent, "date" | "amount">[], start: string, end: string) {
  return accrue(opening, rates, topups.map((x) => ({ type: "topup" as const, ...x })), start, end);
}

/** Set a new balance and append the matching event, leaving the original account untouched. */
function withEvent<A extends Pick<Account, "balance" | "events">>(a: A, balance: number, type: BalanceEvent["type"], date: string, amount: number): A {
  return { ...a, balance: round2(balance), events: [...(a.events ?? []), { type, date, amount: round2(amount) }] };
}

/** Apply a top-up: adds to balance and logs the event. */
export function applyTopUp<A extends Pick<Account, "balance" | "events">>(a: A, amount: number, date: string): A {
  if (!(amount > 0)) throw new Error("Top-up must be more than £0");
  return withEvent(a, a.balance + amount, "topup", date, amount);
}

/** Apply a withdrawal: reduces balance from that date and logs it. Can't exceed the balance. */
export function applyWithdraw<A extends Pick<Account, "balance" | "events">>(a: A, amount: number, date: string): A {
  if (!(amount > 0)) throw new Error("Withdrawal must be more than £0");
  if (amount > a.balance + 1e-9) throw new Error("You can't withdraw more than the balance");
  return withEvent(a, a.balance - amount, "withdraw", date, amount);
}

/** Record a rate change effective from `date`; ratePct becomes the rate in force on `today`. */
export function applyRateChange<A extends Pick<Account, "ratePct" | "rateHistory" | "createdAt">>(a: A, ratePct: number, date: string, today: string): A {
  if (!(ratePct >= 0 && ratePct < 100)) throw new Error("Rate must be between 0% and 100%");
  const base = migrateRates(a).rateHistory!;
  const history = [...base.filter((p) => p.from !== date), { from: date, ratePct }].sort((x, y) => x.from.localeCompare(y.from));
  return { ...a, rateHistory: history, ratePct: rateOn(history, today) };
}

/** Migration: accounts from before rate history get one period starting at creation. */
export function migrateRates<A extends Pick<Account, "ratePct" | "rateHistory" | "createdAt">>(a: A): A {
  if (a.rateHistory && a.rateHistory.length) return a;
  const from = /^\d{4}-\d{2}-\d{2}/.test(a.createdAt ?? "") ? a.createdAt.slice(0, 10) : "0000-01-01";
  return { ...a, rateHistory: [{ from, ratePct: a.ratePct }] };
}

export function migrateData(d: AppData, today: string): AppData {
  return { ...d, accounts: d.accounts.map((a) => { const m = migrateRates(a); return { ...m, events: m.events ?? [], ratePct: rateOn(m.rateHistory!, today) }; }) };
}

/** Manual balance update (e.g. read from the provider app); logged, not counted as a deposit. */
export function applySetBalance<A extends Pick<Account, "balance" | "events">>(a: A, balance: number, date: string): A {
  if (!(balance >= 0)) throw new Error("Balance can't be negative");
  return withEvent(a, balance, "set", date, balance);
}

/** Sum of top-ups across accounts in a YYYY-MM month. */
export function depositsInMonth(accts: Pick<Account, "events">[], month: string, type: "topup" | "withdraw" = "topup"): number {
  return accts.reduce((s, a) => s + (a.events ?? []).filter((e) => e.type === type && e.date.startsWith(month)).reduce((x, e) => x + e.amount, 0), 0);
}
export const withdrawalsInMonth = (accts: Pick<Account, "events">[], month: string) => depositsInMonth(accts, month, "withdraw");

/** Split last month-on-month change into top-ups vs growth (interest/other). Null without history. */
export function momBreakdown(snaps: Snapshot[]): { change: number; deposits: number; withdrawals: number; growth: number; growthPct: number } | null {
  const pair = lastTwoSnapshots(snaps);
  if (!pair) return null;
  const [prev, cur] = pair;
  const change = cur.totalBalance - prev.totalBalance, deposits = cur.deposits ?? 0, withdrawals = cur.withdrawals ?? 0;
  const growth = change - deposits + withdrawals;
  return { change, deposits, withdrawals, growth, growthPct: (growth / prev.totalBalance) * 100 };
}

/** Monday (UTC) of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(t(date)); const dow = (d.getUTCDay() + 6) % 7;
  return ymd(new Date(t(date) - dow * DAY));
}

/** Interest events grouped by week (Monday) or month, newest first. */
export function interestHistory(events: BalanceEvent[] | undefined, by: "week" | "month"): { period: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const e of events ?? []) if (e.type === "interest") {
    const k = by === "week" ? weekStart(e.date) : e.date.slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + e.amount);
  }
  return [...m].map(([period, amount]) => ({ period, amount })).sort((x, y) => y.period.localeCompare(x.period));
}
