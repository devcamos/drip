import { validDate } from "./products";
import { accountAssets, isCreditAccount } from "./credit-card";
import { applyValuationTransfer, incomeBalance } from "./market-valuation";
import { isArchivedAccount } from "./account-lifecycle";
export { incomeBalance } from "./market-valuation";
import type { Account, AppData, BalanceEvent, Frequency, RatePeriod, Snapshot, IncomeType, Payout } from "./types";

/** Round to pennies, half up. Reading pennies at 15 significant digits drops binary noise (2.135 × 100 is 213.49999…). */
export const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(15))) / 100;

/**
 * Days in the calendar year containing `date` (YYYY-MM-DD), using the Gregorian leap-year rule.
 */
export function daysInYear(date: string): number {
  const year = +date.slice(0, 4);
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/**
 * Daily rate equivalent to an annual equivalent rate (AER): compounding every day
 * of that year earns exactly `aer` percent, in leap years too.
 */
export function dailyRate(aer: number, date: string): number {
  return aer > 0 ? Math.pow(1 + aer / 100, 1 / daysInYear(date)) - 1 : 0;
}

/** Expected income for the calendar month containing `today`, compounded daily at the AER. */
export function monthlyIncome(balance: number, ratePct: number, today = localToday()): number {
  if (!(balance > 0) || !(ratePct > 0)) return 0;
  const start = `${today.slice(0, 7)}-01`;
  return accrue(balance, ratePct, [], start, addMonths(start, 1)).interest;
}

/** Expected income over the 12 months starting at `from`, compounded daily at the AER. */
export function annualIncome(balance: number, ratePct: number, from = localToday()): number {
  if (!(balance > 0) || !(ratePct > 0)) return 0;
  return accrue(balance, ratePct, [], from, addMonths(from, 12)).interest;
}

const PER_YEAR: Record<Frequency, number> = { daily: 365, monthly: 12, quarterly: 4, annually: 1 };
type Categorised = Partial<Pick<Account, "productCategory" | "archivedAt">>;
type IncomeAccount = Pick<Account, "balance" | "ratePct"> & Partial<Pick<Account, "productCategory" | "marketValuation" | "archivedAt">>;

/** Price movements do not rewrite the provider balance used to estimate cash income. */
export function accountMonthlyIncome(account: IncomeAccount, today = localToday()): number {
  return isCreditAccount(account) || isArchivedAccount(account) ? 0 : monthlyIncome(incomeBalance(account), account.ratePct, today);
}

/** Expected income over the 12 months starting at `from`, excluding credit and archived accounts. */
export function accountAnnualIncome(account: IncomeAccount, from = localToday()): number {
  return isCreditAccount(account) || isArchivedAccount(account) ? 0 : annualIncome(incomeBalance(account), account.ratePct, from);
}

/** Amount paid at each payout, compounded daily at the AER over that payment period. */
export function payoutAmount(a: IncomeAccount & Pick<Account, "frequency">, today = localToday()): number {
  if (isCreditAccount(a) || isArchivedAccount(a)) return 0;
  const balance = incomeBalance(a);
  if (a.frequency === "daily") {
    const next = ymd(new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000));
    return accrue(balance, a.ratePct, [], today, next).interest;
  }
  if (a.frequency === "monthly") return monthlyIncome(balance, a.ratePct, today);
  return accrue(balance, a.ratePct, [], today, addMonths(today, a.frequency === "quarterly" ? 3 : 12)).interest;
}

export function totalBalance(accts: (Pick<Account, "balance"> & Categorised)[]): number {
  return accountAssets(accts).reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0);
}

export function totalMonthlyIncome(accts: IncomeAccount[], today = localToday()): number {
  return accts.reduce((s, a) => s + accountMonthlyIncome(a, today), 0);
}

/** Expected annual cash income relative to current asset values; never includes APR. */
export function weightedYield(accts: IncomeAccount[]): number {
  const total = totalBalance(accts);
  if (total === 0) return 0;
  const w = accountAssets(accts).reduce((s, a) => s + Math.max(incomeBalance(a), 0) * Math.max(a.ratePct, 0), 0);
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

type ForecastAccount = IncomeAccount & Partial<Pick<Account, "rateType" | "reinvestIncome" | "bonus">>;
/** Monthly forecast only: never writes estimates into saved accounts or recorded income. */
export function projection(accts: ForecastAccount[], months = 12, monthlyDeposit = 0, today = localToday()) {
  const total = totalBalance(accts);
  const holdings = accountAssets(accts).map(a => ({ account: a, balance: Math.max(a.balance, 0), incomeBasis: Math.max(incomeBalance(a), 0), share: total > 0 ? Math.max(a.balance, 0) / total : 0, bonusApplied: false }));
  const out: { month: number; balance: number; income: number }[] = [];
  let cash = 0, income = 0;
  for (let month = 1; month <= months; month++) {
    const start = addMonths(today, month - 1);
    const end = addMonths(today, month);
    for (const holding of holdings) {
      const a = holding.account;
      let earned = accrue(holding.incomeBasis, a.ratePct, [], start, end).interest;
      if (a.bonus && !holding.bonusApplied && a.bonus.expectedDate >= today && a.bonus.expectedDate <= end) {
        earned += a.bonus.amount; holding.bonusApplied = true;
      }
      income += earned;
      if (a.reinvestIncome ?? a.rateType !== "dividend") { holding.balance += earned; holding.incomeBasis += earned; }
      const deposit = monthlyDeposit * holding.share;
      holding.balance += deposit; holding.incomeBasis += deposit;
    }
    if (total === 0) cash += monthlyDeposit;
    out.push({ month, balance: holdings.reduce((sum, h) => sum + h.balance, cash), income });
  }
  return out;
}

/** Actual payments only, by receipt date. Balance changes and legacy estimates are never income. */
export function recordedIncome(accts: (Pick<Account, "payouts"> & Categorised)[], month?: string, asOf = localToday()): number {
  return accts.filter(account => !isCreditAccount(account)).reduce((sum, a) => sum + a.payouts.filter(p => p.kind === "actual" && p.date <= asOf && (!month || p.date.startsWith(month)) && Number.isFinite(p.amount) && p.amount > 0).reduce((n, p) => n + p.amount, 0), 0);
}

export function pendingBonuses(accts: (Pick<Account, "bonus"> & Categorised)[]): number {
  return accountAssets(accts).reduce((sum, a) => sum + (a.bonus?.amount ?? 0), 0);
}

/** Recording a payment does not assume it is missing from the user's confirmed balance. */
export function recordIncome(a: Account, amount: number, date: string, incomeType: IncomeType): Account {
  if (isCreditAccount(a)) throw new Error("Credit-card payments are not income. Update the amount owed from your statement.");
  if (!Number.isFinite(amount) || round2(amount) <= 0) throw new Error("Income must be at least £0.01.");
  if (!validDate(date)) throw new Error("Enter a valid payment date.");
  const payout: Payout = { date, amount: round2(amount), kind: "actual", incomeType };
  return { ...a, payouts: [...a.payouts, payout], bonus: incomeType === "bonus" ? undefined : a.bonus };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Drip's calendar is UK time: "today" and the current month follow Europe/London, including British Summer Time. */
export const CALENDAR_TIME_ZONE = "Europe/London";
const calendarFormat = new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** Today's date (YYYY-MM-DD) on the UK calendar. Date arithmetic elsewhere stays on UTC midnights via `ymd`. */
export function localToday(now = new Date()): string {
  const parts = calendarFormat.formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Calendar month (YYYY-MM) of an instant on the UK calendar. */
export const monthKey = (d: Date) => localToday(d).slice(0, 7);

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
    .filter((a) => !isCreditAccount(a) && a.frequency !== "daily")
    .map((a) => ({ account: a, date: nextPayout(a.nextPayoutDate, a.frequency, today), amount: payoutAmount(a, today) }))
    .filter((p) => p.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Insert/replace the snapshot for the current month. */
export function upsertSnapshot(snaps: Snapshot[], accts: Account[], now: Date): Snapshot[] {
  const key = monthKey(now);
  const snap: Snapshot = { month: key, totalBalance: round2(totalBalance(accts)), monthlyIncome: round2(totalMonthlyIncome(accts, localToday(now))), deposits: round2(depositsInMonth(accts, key)), withdrawals: round2(withdrawalsInMonth(accts, key)) };
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
 * Each day uses the rate in force that day, converted from the annual equivalent rate (AER)
 * so a full year at a constant rate earns exactly that rate, in leap years too. Top-ups and withdrawals apply on their date,
 * so interest before them uses the old balance and compounding continues from the new one.
 * A manual balance update ("set") replaces the running balance from its date onwards.
 */
export function accrue(opening: number, rates: number | RatePeriod[], events: Pick<BalanceEvent, "type" | "date" | "amount">[], start: string, end: string) {
  // Sorted once here: rateOn is called for every day in the period.
  const hist = sortRates(typeof rates === "number" ? [{ from: "0000-01-01", ratePct: rates }] : rates);
  // Array.sort is stable, so same-day events keep the order they were logged in.
  const evs = events.filter((x) => (x.type === "topup" || x.type === "withdraw" || x.type === "set") && x.date >= start && x.date < end && (x.type === "set" ? x.amount >= 0 : x.amount > 0))
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = Math.max(opening, 0);
  let bal = open, deposits = 0, withdrawals = 0, interest = 0, i = 0;
  for (let day = t(start); day < t(end); day += DAY) {
    const d = ymd(new Date(day));
    for (; i < evs.length && evs[i].date === d; i++) {
      if (evs[i].type === "set") bal = evs[i].amount; // a confirmed reading resets the balance; not a transfer
      else if (evs[i].type === "topup") { bal += evs[i].amount; deposits += evs[i].amount; }
      else { const w = Math.min(evs[i].amount, bal); bal -= w; withdrawals += w; }
    }
    const inc = bal * dailyRate(Math.max(rateOnSorted(hist, d), 0), d);
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
  if (!validDate(date) || date > localToday()) throw new Error("Use today or a past date for an actual balance change.");
  const priced = a as A & Partial<Pick<Account, "marketValuation" | "investment">>;
  const transfer = type === "topup" || type === "withdraw";
  const review = transfer && priced.investment ? { positionReviewRequired: true as const } : {};
  if (priced.marketValuation && transfer) return { ...applyValuationTransfer(priced, type, date, amount), ...review };
  const updated = { ...a, ...review, balance: round2(balance), events: [...(a.events ?? []), { type, date, amount: round2(amount) }] };
  if ("marketValuation" in updated) { const { marketValuation: _valuation, ...recorded } = updated; return recorded as A; }
  return updated;
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
  if (amount > lowestBalanceFrom(a, date) + 1e-9) throw new Error("You can't withdraw more than the balance on that date. Check the date, or log the top-up that came first.");
  return withEvent(a, a.balance - amount, "withdraw", date, amount);
}

/**
 * Lowest running balance from the end of `date` (after that day's logged events) until the next
 * manual balance update after it. A back-dated withdrawal must fit within this, or the history goes below zero.
 */
function lowestBalanceFrom(a: Pick<Account, "balance" | "events">, date: string): number {
  let balance = confirmedBalanceOn(a, date), lowest = Infinity;
  const ordered = (a.events ?? []).map((event, index) => ({ event, index }))
    .filter(({ event }) => event.date >= date && (event.type === "topup" || event.type === "withdraw" || event.type === "set"))
    .sort((x, y) => x.event.date.localeCompare(y.event.date) || x.index - y.index).map(({ event }) => event);
  for (const event of ordered) {
    if (event.date > date && lowest > balance) lowest = balance;
    if (event.type === "set") { if (event.date > date) break; balance = event.amount; }
    else balance += event.type === "topup" ? event.amount : -event.amount;
  }
  return Math.min(lowest, balance);
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
  return { ...d, accounts: d.accounts.map((a) => { if (isCreditAccount(a)) return a; const m = migrateRates(a); return { ...m, events: m.events ?? [], ratePct: rateOn(m.rateHistory!, today) }; }) };
}

/** Manual balance update (e.g. read from the provider app); logged, not counted as a deposit. */
export function applySetBalance<A extends Pick<Account, "balance" | "events">>(a: A, balance: number, date: string): A {
  if (!(balance >= 0)) throw new Error("Balance can't be negative");
  return withEvent(a, balance, "set", date, balance);
}

/** Sum of top-ups across accounts in a YYYY-MM month. */
export function depositsInMonth(accts: (Pick<Account, "events"> & Categorised)[], month: string, type: "topup" | "withdraw" = "topup"): number {
  return accts.filter(account => !isCreditAccount(account)).reduce((s, a) => s + (a.events ?? []).filter((e) => e.type === type && e.date.startsWith(month)).reduce((x, e) => x + e.amount, 0), 0);
}
export const withdrawalsInMonth = (accts: (Pick<Account, "events"> & Categorised)[], month: string) => depositsInMonth(accts, month, "withdraw");

const monthEndOf = (month: string) => ymd(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)));
const nextMonthStart = (month: string) => ymd(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)));

/** First day an account has history: its creation day or its earliest logged event, whichever is earlier. */
export function historyStart(account: Pick<Account, "createdAt" | "events">): string {
  const dates = [(account.createdAt ?? "").slice(0, 10), ...(account.events ?? []).map((event) => event.date)].filter(validDate);
  return dates.sort((a, b) => a.localeCompare(b))[0] ?? "";
}

/**
 * One snapshot per month, from the first recorded history to the month containing `today`.
 * Saved snapshots win. A month without one is rebuilt from manual balance updates, logged
 * transfers and rate history, and marked `rebuilt`. Rebuilt months are for display only:
 * they are never saved, and unlogged growth (e.g. interest) isn't invented for them.
 */
export function monthlyHistory(snaps: Snapshot[], accts: Account[], today = localToday()): Snapshot[] {
  const current = today.slice(0, 7);
  const assets = accountAssets(accts);
  const saved = new Map(snaps.map((snap) => [snap.month, snap]));
  const months = [...assets.map(historyStart).filter(Boolean).map((day) => day.slice(0, 7)), ...snaps.map((snap) => snap.month)].sort((a, b) => a.localeCompare(b));
  const out: Snapshot[] = [];
  for (let month = months[0]; month && month <= current; month = nextMonthStart(month).slice(0, 7)) {
    const kept = saved.get(month);
    if (kept) { out.push(kept); continue; }
    const live = month === current;
    const asOf = live ? today : monthEndOf(month);
    const open = assets.filter((account) => { const start = historyStart(account); return !!start && start <= asOf; });
    if (!open.length) continue; // nothing recorded to rebuild from: leave the gap rather than invent £0
    const rows = open.map((account) => {
      const balance = Math.max(live ? account.balance : confirmedBalanceOn(account, nextMonthStart(month)), 0);
      const income = live ? accountMonthlyIncome(account, today) : monthlyIncome(balance, rateOn(migrateRates(account).rateHistory!, asOf), asOf);
      return { balance, income };
    });
    out.push({ month, totalBalance: round2(rows.reduce((sum, row) => sum + row.balance, 0)), monthlyIncome: round2(rows.reduce((sum, row) => sum + row.income, 0)),
      deposits: round2(depositsInMonth(open, month)), withdrawals: round2(withdrawalsInMonth(open, month)), rebuilt: true });
  }
  return [...out, ...snaps.filter((snap) => snap.month > current)];
}

/** Month-end dates of the `count` months before `today`'s month, most recent first. */
export function pastMonthEnds(today: string, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => monthEndOf(addMonths(`${today.slice(0, 7)}-01`, -(i + 1)).slice(0, 7)));
}

/**
 * Optional past month-end balances typed once when adding an account. Blank entries are skipped.
 * Returns null when any entry is not a non-negative amount, so nothing half-valid is saved.
 */
export function parsePastBalances(values: readonly string[], dates: readonly string[]): { date: string; balance: number }[] | null {
  const out: { date: string; balance: number }[] = [];
  for (const [i, raw] of values.entries()) {
    const value = raw.trim();
    if (!value) continue;
    const balance = Number(value);
    if (!Number.isFinite(balance) || balance < 0 || balance > 1e12 || !validDate(dates[i])) return null;
    out.push({ date: dates[i], balance: round2(balance) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Record past balances as dated manual balance updates, before any existing history. Today's balance is unchanged. */
export function withPastBalances<A extends Pick<Account, "events">>(account: A, entries: readonly { date: string; balance: number }[]): A {
  if (!entries.length) return account;
  const past: BalanceEvent[] = entries.map(({ date, balance }) => ({ type: "set", date, amount: round2(balance) }));
  return { ...account, events: [...past, ...(account.events ?? [])] };
}

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

/**
 * Confirmed balance at the start of `date`, before that day's events.
 * Anchors on the latest manual balance update ("set") before `date` and replays later transfers forward.
 * Without one, it works back from the next update on or after `date` (or today's balance), reversing transfers.
 */
export function confirmedBalanceOn(account: Pick<Account, "balance" | "events">, date: string): number {
  const ordered = (account.events ?? [])
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === "topup" || event.type === "withdraw" || event.type === "set")
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.index - b.index)
    .map(({ event }) => event);
  const split = ordered.findIndex((event) => event.date >= date);
  const before = split < 0 ? ordered : ordered.slice(0, split), after = split < 0 ? [] : ordered.slice(split);
  const anchor = before.findLastIndex((event) => event.type === "set");
  let balance: number;
  if (anchor >= 0) {
    balance = before[anchor].amount;
    for (const event of before.slice(anchor + 1)) balance += event.type === "withdraw" ? -event.amount : event.amount;
  } else {
    const next = after.findIndex((event) => event.type === "set");
    const reversed = next < 0 ? after : after.slice(0, next);
    balance = next < 0 ? account.balance : after[next].amount;
    for (const event of reversed) balance += event.type === "withdraw" ? event.amount : -event.amount;
  }
  return Math.max(round2(balance), 0);
}

type AccrualAccount = IncomeAccount & Pick<Account, "events" | "rateHistory" | "createdAt" | "rateType">;

/**
 * Expected interest from `start` (inclusive) to `end` (exclusive) using daily
 * compounding, the account's rate history, and logged top-ups or withdrawals.
 * Dividend holdings use this month's AER daily-compounded estimate; they are not accrued from transfers or rate history.
 */
export function expectedInterest(account: AccrualAccount, start: string, end: string): number {
  if (isCreditAccount(account) || isArchivedAccount(account)) return 0;
  if (account.rateType === "dividend") return accountMonthlyIncome(account, start);
  // No interest before the account was added: start from its creation day when that is later.
  const created = /^\d{4}-\d{2}-\d{2}/.test(account.createdAt ?? "") ? account.createdAt.slice(0, 10) : "";
  if (created > start) start = created;
  if (start >= end) return 0;
  return accrue(confirmedBalanceOn(account, start), migrateRates(account).rateHistory!, account.events ?? [], start, end).interest;
}

/** Expected interest for the calendar month containing `today`. */
export function currentPeriodInterest(account: AccrualAccount, today = localToday()): number {
  const start = `${today.slice(0, 7)}-01`;
  return expectedInterest(account, start, addMonths(start, 1));
}

export function totalCurrentPeriodInterest(accounts: AccrualAccount[], today = localToday()): number {
  return accounts.reduce((sum, account) => sum + currentPeriodInterest(account, today), 0);
}
