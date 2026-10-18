"use client";
import { useState } from "react";
import type { Account, IncomeType } from "@/lib/types";
import { productLabel, validDate } from "@/lib/products";
import * as M from "@/lib/maths";
import { IncomeSummary } from "./IncomeSummary";
const today = () => M.ymd(new Date());
const fmtDate = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const incomeLabel = { interest: "Interest", dividend: "Dividend", bonus: "Bonus" };
const balanceChange = { topup: M.applyTopUp, withdraw: M.applyWithdraw, set: M.applySetBalance };
const eventStyle = {
  topup: { label: "Top up", className: "ok", prefix: "+" }, withdraw: { label: "Withdrawal", className: "err", prefix: "−" },
  set: { label: "Balance set", className: "", prefix: "" }, interest: { label: "Interest", className: "", prefix: "" },
};
type Props = Readonly<{ a: Account; onBack: () => void; onEdit: () => void; onDelete: () => void; onChange: (fn: (x: Account) => Account) => void }>;

function BalanceActions({ a, onChange }: Pick<Props, "a" | "onChange">) {
  const [mode, setMode] = useState<"topup" | "withdraw" | "set" | null>(null);
  const [error, setError] = useState(""); const [value, setValue] = useState(""); const [date, setDate] = useState(today());
  const labels = { topup: "Top up", withdraw: "Withdraw", set: "Update balance" };
  const descriptions = {
    topup: "Adds money to your balance and records a deposit. This isn't income.",
    withdraw: "Reduces your balance and records a withdrawal. This isn't negative income.",
    set: "Enter the balance shown by your provider. This replaces your balance and updates predictions. The difference isn't recorded as income.",
  };
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && (mode === "set" ? n >= 0 : M.round2(n) > 0) && validDate(date);
  return <>
    <div className="row-gap">{(["topup", "withdraw", "set"] as const).map(action => <button key={action} className={`btn ${action === "topup" ? "" : "ghost"}`} onClick={() => { setMode(action); setValue(action === "set" ? String(a.balance) : ""); setError(""); }}>{labels[action]}</button>)}</div>
    {mode && <form className="panel" onSubmit={event => {
      event.preventDefault(); if (!valid) return;
      if (mode === "withdraw" && n > a.balance) { setError("You can't withdraw more than the balance."); return; }
      onChange(x => balanceChange[mode](x, n, date)); setMode(null);
    }}>
      <h2 style={{ marginTop: 0 }}>{labels[mode]}</h2><p className="muted">{descriptions[mode]}</p>
      <div className="grid"><div><label htmlFor="balance-amount">{mode === "set" ? "New balance £" : "Amount £"}</label><input id="balance-amount" inputMode="decimal" aria-label="amount" value={value} onChange={e => setValue(e.target.value)} /></div><div><label htmlFor="balance-date">Date</label><input id="balance-date" type="date" aria-label="date" value={date} onChange={e => setDate(e.target.value)} /></div></div>
      <div className="row-gap"><button type="submit" className="btn small" disabled={!valid}>Save</button><button type="button" className="btn ghost small" onClick={() => setMode(null)}>Cancel</button></div>
      {error && <p role="alert" className="err">{error}</p>}
    </form>}
  </>;
}

function IncomeHistory({ a, onChange }: Pick<Props, "a" | "onChange">) {
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(today());
  const [type, setType] = useState<IncomeType>(a.rateType);
  const [by, setBy] = useState<"week" | "month">("month");
  const [message, setMessage] = useState("");
  const history = a.payouts.map((p, index) => ({ ...p, index })).filter(p => p.kind === "actual").toSorted((x, y) => y.date.localeCompare(x.date));
  const groups = new Map<string, number>();
  for (const p of history) {
    const period = by === "month" ? p.date.slice(0, 7) : M.weekStart(p.date);
    groups.set(period, (groups.get(period) ?? 0) + p.amount);
  }
  const valid = Number.isFinite(Number(amount)) && M.round2(Number(amount)) > 0 && validDate(date) && date <= today();
  return <section className="panel" aria-label="Income history">
    <h2 style={{ marginTop: 0 }}>Income received</h2>
    <p className="muted">Log individual payments or one monthly total. Only log each amount once. Recording income leaves your saved balance unchanged.</p>
    {history.length === 0 ? <p className="muted">No income logged yet.</p> : <>
      <fieldset className="row-gap"><legend>Group payments</legend><button className={`btn small ${by === "week" ? "" : "ghost"}`} aria-pressed={by === "week"} onClick={() => setBy("week")}>By week</button><button className={`btn small ${by === "month" ? "" : "ghost"}`} aria-pressed={by === "month"} onClick={() => setBy("month")}>By month</button></fieldset>
      <ul className="list" data-testid="income-history">{[...groups].map(([period, total]) => <li key={period}><span>{by === "week" ? `Week of ${fmtDate(period)}` : new Date(period + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span><b className="ok">+{M.gbp(total)}</b></li>)}</ul>
      <details><summary>View payments</summary><ul className="list">{history.map(p => <li key={p.index}><span>{incomeLabel[p.incomeType ?? a.rateType]}<br /><span className="muted">{fmtDate(p.date)}</span></span><span><b>{M.gbp(p.amount)}</b><br /><button className="btn ghost small" aria-label={`Remove ${incomeLabel[p.incomeType ?? a.rateType].toLowerCase()} payment of ${M.gbp(p.amount)} on ${fmtDate(p.date)}`} onClick={() => {
        if (confirm("Remove this recorded payment? Your balance will stay unchanged.")) onChange(x => ({ ...x, payouts: x.payouts.filter((_, index) => index !== p.index) }));
      }}>Remove</button></span></li>)}</ul></details>
    </>}
    <form onSubmit={event => {
      event.preventDefault(); if (!valid) return;
      onChange(x => M.recordIncome(x, Number(amount), date, type)); setAmount(""); setType(a.rateType); setMessage("Income recorded. Update your balance separately if needed.");
    }}>
      <label htmlFor="income-type">Payment type</label><select id="income-type" value={type} onChange={e => setType(e.target.value as IncomeType)}><option value={a.rateType}>{incomeLabel[a.rateType]}</option><option value="bonus">Bonus</option></select>
      <div className="grid"><div><label htmlFor="income-amount">Amount received £</label><input id="income-amount" aria-label="Income amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div><div><label htmlFor="income-date">Payment date</label><input id="income-date" type="date" max={today()} aria-label="Income date" value={date} onChange={e => setDate(e.target.value)} /></div></div>
      {type === "bonus" && a.bonus && <p className="muted">Recording this bonus payment clears the pending bonus so it won&apos;t be predicted again.</p>}
      <div className="row-gap"><button type="submit" className="btn small" disabled={!valid}>Record income</button></div>
    </form>
    {message && <output className="muted">{message}</output>}
  </section>;
}

export function AccountDetail({ a, onBack, onEdit, onDelete, onChange }: Props) {
  const events = (a.events ?? []).filter(e => e.type !== "interest").toSorted((x, y) => y.date.localeCompare(x.date));
  const legacy = M.interestHistory(a.events, "month");
  const forecast = M.projection([a], 12).at(-1)!;
  return <>
    <button className="btn ghost small" onClick={onBack}>← Accounts</button>
    <div className="card" style={{ marginTop: 12, cursor: "default" }}>
      <div className="row"><span className="prov">{a.provider}</span><span>{productLabel(a)}</span></div>
      {a.label && <div className="meta">{a.label}</div>}<div className="bal">{M.gbp(a.balance)}</div>
    </div>
    <p className="muted">Your entered balance. Predictions and recorded income never change it automatically.</p>
    <BalanceActions a={a} onChange={onChange} />
    <IncomeSummary accounts={[a]} />
    <section className="panel" aria-label="Income predictions"><h2 style={{ marginTop: 0 }}>Predictions</h2>
      <div className="grid">
        <div className="stat"><div className="muted">{a.rateType === "dividend" ? "Expected dividend yield" : "Standard interest rate"}</div><div className="v">{a.ratePct}%</div></div>
        <div className="stat"><div className="muted">Estimated per month</div><div className="v">{M.gbp(M.monthlyIncome(a.balance, a.ratePct))}</div></div>
        <div className="stat"><div className="muted">{a.frequency === "daily" ? "Per day (est.)" : "Estimated next payment"}</div><div className="v">{M.gbp(M.payoutAmount(a))}</div><div className="muted">{a.frequency === "daily" ? "Daily interest / income" : fmtDate(M.nextPayout(a.nextPayoutDate, a.frequency, today()))}</div></div>
        <div className="stat"><div className="muted">Predicted income over 1 year</div><div className="v">{M.gbp(forecast.income)}</div></div>
      </div>
      <p className="muted">Monthly and daily figures are averages using your annual rate or dividend yield. Actual payments can vary. The yearly forecast assumes current rates and {a.reinvestIncome ?? a.rateType !== "dividend" ? "monthly reinvestment" : "income paid out"}.</p>
      {a.bonus && <div className="panel"><h3 style={{ marginTop: 0 }}>Pending bonus · {M.gbp(a.bonus.amount)}</h3><p className="muted">Expected {fmtDate(a.bonus.expectedDate)}. Kept outside your balance and received income.</p><p className="muted">{a.bonus.expectedDate < today() ? "The expected date has passed. Edit the date or record the payment; this bonus is excluded from future predictions." : "Included once in predictions on its expected date. Update the amount from your provider when needed."}</p></div>}
    </section>
    <IncomeHistory a={a} onChange={onChange} />
    {events.length > 0 && <section className="panel"><h2 style={{ marginTop: 0 }}>Top-ups, withdrawals and updates</h2><ul className="list" data-testid="events">{events.map((e, i) => <li key={`${e.date}-${i}`}><span>{eventStyle[e.type].label}<br /><span className="muted">{fmtDate(e.date)}</span></span><b className={eventStyle[e.type].className}>{eventStyle[e.type].prefix}{M.gbp(e.amount)}</b></li>)}</ul></section>}
    {legacy.length > 0 && <details className="panel"><summary>Previous interest estimates</summary><p className="muted">Older Drip versions added these estimates to your balance. They aren&apos;t recorded income. Your saved balance has been preserved; update it using your provider&apos;s current figure.</p><ul className="list">{legacy.map(row => <li key={row.period}><span>{row.period}</span><b>{M.gbp(row.amount)}</b></li>)}</ul></details>}
    {(a.rateHistory?.length ?? 0) > 1 && <section className="panel"><h2 style={{ marginTop: 0 }}>Rate history</h2><ul className="list">{a.rateHistory!.toReversed().map(r => <li key={r.from}><span>{r.from === "0000-01-01" ? "Since added" : `From ${fmtDate(r.from)}`}</span><b>{r.ratePct}%</b></li>)}</ul></section>}
    <div className="row-gap"><button className="btn ghost" onClick={onEdit}>Edit</button><button className="btn danger" onClick={onDelete}>Delete</button></div>
  </>;
}
