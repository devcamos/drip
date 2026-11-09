"use client";
import type { Account } from "@/lib/types";
import { gbp } from "@/lib/maths";
import { debtPaymentReminders, paymentReminders } from "@/lib/payment-reminders";
import { displayProvider } from "@/lib/products";
import { useCalendarDay } from "./useCalendarDay";
import { PhoneReminders } from "./PhoneReminders";
import { PaymentCalendar } from "./PaymentCalendar";
import { isCreditAccount } from "@/lib/credit-card";

function paymentType(account: Account) {
  if (isCreditAccount(account)) return "Repayment";
  if (account.frequency === "daily") return "Daily";
  return account.rateType === "dividend" ? "Dividend" : "Interest";
}
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export function PaymentNotifications({ accounts, identityId, onOpen }: Readonly<{ accounts: Account[]; identityId?: string; onOpen: (id: string) => void }>) {
  const day = useCalendarDay();
  const reminders = [...paymentReminders(accounts, day), ...debtPaymentReminders(accounts, day)].toSorted((a, b) => a.date.localeCompare(b.date));
  const due = reminders.filter(reminder => reminder.date === day);
  const overdue = reminders.filter(reminder => reminder.date < day);
  const future = reminders.filter(reminder => reminder.date > day);
  const list = (items: typeof reminders) => <ul className="payment-reminders">{items.map(reminder => <li key={reminder.account.id} className={reminder.logged && reminder.date === day ? "payment-logged" : ""}><div className="payment-date"><span>{dateLabel(reminder.date)}</span><small>{paymentType(reminder.account)}</small></div><div><b>{reminder.account.holdingName ?? displayProvider(reminder.account.provider)}</b><span className="muted">{isCreditAccount(reminder.account) ? "Planned repayment" : "Estimated"} {gbp(reminder.amount)}</span><small>{isCreditAccount(reminder.account) ? `Statement minimum ${gbp(reminder.account.creditCard!.minimumPayment)} · check your provider` : reminder.logged && reminder.date === day ? "Payment logged today" : "Expected payment — check your provider"}</small></div><button className="btn ghost small" onClick={() => onOpen(reminder.account.id)}>Open</button></li>)}</ul>;
  return <>
    <div className="section-heading"><p className="section-eyebrow">YOUR PAYMENT DATES</p><h1>Payment notifications</h1><p className="muted">Expected income and credit-card statement dates. Repayments stay separate from income.</p></div>
    <section className="panel" aria-labelledby="payments-today"><div className="wallet-heading"><h2 id="payments-today">Today</h2><span className="payment-count">{due.filter(reminder => !reminder.logged).length} to check</span></div>
      {due.length ? list(due) : <p className="muted">No payments expected today.</p>}
      <p className="muted">A reminder does not confirm a payment arrived. Log the amount you actually receive; reminders never change balances.</p>
    </section>
    {overdue.length > 0 && <section className="panel" aria-label="Overdue repayments"><h2>Check overdue statements</h2>{list(overdue)}<p className="muted">If you have paid, mark the statement paid in the credit-card account. This does not change your recorded debt.</p></section>}
    <PhoneReminders accounts={accounts} identityId={identityId} />
    <section className="panel" aria-labelledby="payments-next"><h2 id="payments-next">Next payment by account</h2>{future.length ? list(future) : <p className="muted">{due.length ? "Daily payments appear in Today each day. Other accounts will appear here when their next date is in the future." : "Add an account and its payment schedule to see reminders here."}</p>}</section>
    <PaymentCalendar accounts={accounts} today={day} onOpen={onOpen} />
  </>;
}
