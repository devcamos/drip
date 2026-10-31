import type { Account } from "./types";
import { addMonths, round2, ymd } from "./maths";
import { followingDay, nextPayment, paymentReminders } from "./payment-reminders";
import { validDate } from "./products";

export type CalendarPayment = { account: Account; date: string; through: string; occurrences: number; amount: number };
export type PaymentMonth = { month: string; payments: CalendarPayment[]; count: number; amount: number };
const dayMs = 86_400_000;
const previousDay = (date: string) => ymd(new Date(Date.parse(`${date}T00:00:00Z`) - dayMs));

/** Tomorrow starts the forward calendar; today's payments have their own panel.
 * Each recurrence uses the original anchor, never a previously clamped date.
 * Daily payments are grouped per month rather than creating thousands of rows.
 * This is a read-only projection: it never creates payouts or changes balances.
 */
export function paymentCalendar(accounts: Account[], today: string) {
  if (!validDate(today)) return null;
  const from = followingDay(today), until = addMonths(from, 12);
  if (!validDate(until)) return null;
  const schedules = paymentReminders(accounts, from).filter(item => Number.isFinite(item.amount) && item.amount > 0);
  const months: PaymentMonth[] = [];
  let month = from.slice(0, 7) + "-01";
  for (let index = 0; index < 13 && month < until; index++, month = addMonths(month, 1)) {
    const start = month > from ? month : from;
    const nextMonth = addMonths(month, 1);
    const through = previousDay(nextMonth < until ? nextMonth : until);
    const payments: CalendarPayment[] = [];
    for (const schedule of schedules) {
      const daily = schedule.account.frequency === "daily";
      const date = daily ? (schedule.date > start ? schedule.date : start) : nextPayment({ anchor: schedule.account.nextPayoutDate, frequency: schedule.account.frequency }, start);
      if (date > through) continue;
      const occurrences = daily ? (Date.parse(through + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / dayMs + 1 : 1;
      const amount = round2(schedule.amount * occurrences);
      if (!Number.isFinite(amount)) continue;
      payments.push({ account: schedule.account, date, through: daily ? through : date, occurrences, amount });
    }
    payments.sort((a, b) => a.date.localeCompare(b.date) || a.account.id.localeCompare(b.account.id));
    months.push({ month: month.slice(0, 7), payments, count: payments.reduce((sum, payment) => sum + payment.occurrences, 0), amount: round2(payments.reduce((sum, payment) => sum + payment.amount, 0)) });
  }
  return { from, through: previousDay(until), months };
}
