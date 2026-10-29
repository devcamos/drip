"use client";
import type { Account } from "@/lib/types";
import { gbp } from "@/lib/maths";
import { paymentReminders } from "@/lib/payment-reminders";
import { displayProvider } from "@/lib/products";
import { useCalendarDay } from "./useCalendarDay";
import { PhoneReminders } from "./PhoneReminders";

const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export function PaymentNotifications({ accounts, identityId, onOpen }: Readonly<{ accounts: Account[]; identityId?: string; onOpen: (id: string) => void }>) {
  const day = useCalendarDay();
  const reminders = paymentReminders(accounts, day);
  const due = reminders.filter(reminder => reminder.date === day);
  const future = reminders.filter(reminder => reminder.date > day);
  const list = (items: typeof reminders) => <ul className="payment-reminders">{items.map(reminder => <li key={reminder.account.id} className={reminder.logged && reminder.date === day ? "payment-logged" : ""}><div className="payment-date"><span>{dateLabel(reminder.date)}</span><small>{reminder.account.frequency === "daily" ? "Daily" : reminder.account.rateType === "dividend" ? "Dividend" : "Interest"}</small></div><div><b>{reminder.account.holdingName ?? displayProvider(reminder.account.provider)}</b><span className="muted">Estimated {gbp(reminder.amount)}</span><small>{reminder.logged && reminder.date === day ? "Payment logged today" : "Expected payment — check your provider"}</small></div><button className="btn ghost small" onClick={() => onOpen(reminder.account.id)}>Open</button></li>)}</ul>;
  return <>
    <div className="section-heading"><p className="section-eyebrow">KEEP AN EYE ON PAYDAY</p><h1>Payment notifications</h1><p className="muted">Expected payment dates across all your income accounts.</p></div>
    <section className="panel" aria-labelledby="payments-today"><div className="wallet-heading"><h2 id="payments-today">Today</h2><span className="payment-count">{due.filter(reminder => !reminder.logged).length} to check</span></div>
      {due.length ? list(due) : <p className="muted">No payments expected today.</p>}
      <p className="muted">A reminder does not confirm a payment arrived. Log the amount you actually receive; reminders never change balances.</p>
    </section>
    <PhoneReminders accounts={accounts} identityId={identityId} />
    <section className="panel" aria-labelledby="payments-next"><h2 id="payments-next">Next payment by account</h2>{future.length ? list(future) : <p className="muted">{due.length ? "Daily payments appear in Today each day. Other accounts will appear here when their next date is in the future." : "Add an account and its payment schedule to see reminders here."}</p>}</section>
  </>;
}
