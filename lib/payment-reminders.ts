import type { Account, Frequency } from "./types";
import { addMonths, payoutAmount, ymd } from "./maths";
import { validDate } from "./products";
import { isCreditAccount } from "./credit-card";
import { activeAccounts } from "./account-lifecycle";

export type PaymentPlan = { anchor: string; frequency: Frequency; skipDate?: string; once?: true };
export type ReminderSchedule = { timeZone: string; plans: PaymentPlan[] };
const months: Record<Exclude<Frequency, "daily">, number> = { monthly: 1, quarterly: 3, annually: 12 };
function accountPlan(account: Account, day: string): PaymentPlan {
  const created = account.createdAt.slice(0, 10);
  let anchor = account.nextPayoutDate;
  if (account.frequency === "daily") {
    anchor = day;
    if (validDate(account.nextPayoutDate)) anchor = account.nextPayoutDate;
    if (validDate(created)) anchor = created;
  }
  return { anchor, frequency: account.frequency };
}

export function dateInZone(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Anchor-based arithmetic preserves month-end and leap-day schedules without loops. */
export function nextPayment(plan: PaymentPlan, today: string): string {
  if (plan.once) return plan.anchor;
  if (plan.frequency === "daily") return plan.anchor > today ? plan.anchor : today;
  const difference = (Number(today.slice(0, 4)) - Number(plan.anchor.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(plan.anchor.slice(5, 7));
  const step = months[plan.frequency];
  const periods = Math.max(0, Math.floor(difference / step));
  const candidate = addMonths(plan.anchor, periods * step);
  return candidate < today ? addMonths(plan.anchor, (periods + 1) * step) : candidate;
}

export function followingDay(day: string) { return ymd(new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)); }
export function paymentDue(plan: PaymentPlan, day: string) { return plan.skipDate !== day && nextPayment(plan, day) === day; }
export function nextReminder(schedule: ReminderSchedule, today: string): string | null {
  const dates = schedule.plans.filter(plan => !plan.once || plan.anchor >= today && plan.skipDate !== plan.anchor).map(plan => nextPayment(plan, plan.skipDate === today ? followingDay(today) : today));
  return dates.length ? dates.toSorted((a, b) => a.localeCompare(b))[0] : null;
}
export function loggedToday(account: Account, day: string) {
  return account.payouts.some(payment => payment.kind === "actual" && payment.date === day && payment.amount > 0 && Number.isFinite(payment.amount) && (payment.incomeType ?? account.rateType) === account.rateType);
}

/** Only dates/frequencies leave the encrypted vault: no identities, names or figures. */
export function reminderSchedule(accounts: Account[], day: string, timeZone: string): ReminderSchedule {
  const plans: PaymentPlan[] = activeAccounts(accounts).filter(account => !isCreditAccount(account) && account.balance > 0 && account.ratePct > 0).map(account => ({
    ...accountPlan(account, day),
    ...(loggedToday(account, day) ? { skipDate: day } : {}),
  })).filter(plan => validDate(plan.anchor));
  plans.push(...debtPaymentReminders(accounts, day).filter(reminder => reminder.date >= day).map(reminder => ({ anchor: reminder.date, frequency: "monthly" as const, once: true as const })));
  return { timeZone, plans: [...new Map(plans.map(plan => [JSON.stringify(plan), plan])).values()] };
}

export function paymentReminders(accounts: Account[], day: string) {
  return activeAccounts(accounts).filter(account => !isCreditAccount(account) && account.balance > 0 && account.ratePct > 0 && validDate(accountPlan(account, day).anchor)).map(account => ({
    account,
    date: nextPayment(accountPlan(account, day), day),
    amount: payoutAmount(account),
    logged: loggedToday(account, day),
  })).toSorted((a, b) => a.date.localeCompare(b.date) || (a.account.holdingName ?? a.account.provider).localeCompare(b.account.holdingName ?? b.account.provider));
}

/** Statement dates are one-off obligations, never guessed future statements. */
export function debtPaymentReminders(accounts: Account[], day: string) {
  return activeAccounts(accounts).filter(account => isCreditAccount(account) && account.balance > 0 && !!account.creditCard && !account.creditCard.statementPaid &&
    validDate(account.nextPayoutDate) && (account.creditCard.minimumPayment > 0 || (account.creditCard.plannedPayment ?? 0) > 0)).map(account => ({
    account, date: account.nextPayoutDate,
    amount: Math.min(account.balance, account.creditCard!.plannedPayment ?? account.creditCard!.minimumPayment),
    logged: false, repayment: true as const, overdue: account.nextPayoutDate < day,
  })).toSorted((a, b) => a.date.localeCompare(b.date) || a.account.provider.localeCompare(b.account.provider));
}
