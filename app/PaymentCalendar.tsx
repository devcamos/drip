"use client";
import type { Account } from "@/lib/types";
import { gbp } from "@/lib/maths";
import { paymentCalendar } from "@/lib/payment-calendar";
import { displayProvider } from "@/lib/products";

const dateLabel = (date: string, year = false) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function PaymentCalendar({ accounts, today, onOpen }: Readonly<{ accounts: Account[]; today: string; onOpen: (id: string) => void }>) {
  const calendar = paymentCalendar(accounts, today);
  if (!calendar) return null;
  const first = calendar.months.findIndex(month => month.payments.length > 0);
  return <section className="panel payment-calendar" aria-labelledby="payment-calendar-title">
    <h2 id="payment-calendar-title">Payment calendar</h2>
    <p className="muted">Next 12 months · {dateLabel(calendar.from, true)} – {dateLabel(calendar.through, true)}</p>
    <p className="muted">Your next payout date and frequency predict future dates. Edit either in the account to update this calendar. Today&apos;s payments are listed above.</p>
    {first < 0 ? <p className="muted">No payments expected in this period. Add an earning account with a payment date and frequency to get started.</p> : calendar.months.map((month, index) => <details className="payment-month" key={month.month} open={index === first} data-testid={`payment-month-${month.month}`}>
      <summary><b>{monthLabel(month.month)}</b><span>{month.count ? `${month.count} expected ${month.count === 1 ? "payment" : "payments"} · ${gbp(month.amount)} estimated` : "No expected payments"}</span></summary>
      {month.payments.length ? <ul className="payment-reminders" aria-label={`Expected payments for ${monthLabel(month.month)}`}>{month.payments.map(payment => {
        const name = payment.account.holdingName ?? displayProvider(payment.account.provider);
        return <li key={`${payment.account.id}-${payment.date}`}><div className="payment-date"><time dateTime={payment.date}>{dateLabel(payment.date)}</time>{payment.account.frequency === "daily" && <time dateTime={payment.through}>– {dateLabel(payment.through)}</time>}</div><div><b>{name}</b><span className="muted">Expected {payment.account.rateType === "dividend" ? "dividend" : "interest"} · {gbp(payment.amount)}</span><small>{payment.account.frequency === "daily" ? `${payment.occurrences} daily payments, grouped` : "Check your provider for the confirmed date"}</small></div><button className="btn ghost small" aria-label={`Open ${name} for ${payment.date}`} onClick={() => onOpen(payment.account.id)}>Open</button></li>;
      })}</ul> : <p className="muted">No payments expected in this month.</p>}
    </details>)}
    <p className="muted calendar-assumptions">Estimates use your current balance and yield, without compounding or one-off bonuses. Dates can change. Only payments you record count as received income.</p>
  </section>;
}
