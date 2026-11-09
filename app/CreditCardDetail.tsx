"use client";

import { useState } from "react";
import type { Account } from "@/lib/types";
import { accountCardStyle } from "@/lib/account-colour";
import { creditCardWarnings } from "@/lib/credit-card";
import { gbp } from "@/lib/maths";
import { displayProvider } from "@/lib/products";

type Props = Readonly<{ account: Account; onBack: () => void; onEdit: () => void; onDelete: () => void | Promise<boolean>; onArchive?: () => void | Promise<boolean>; onChange?: (fn: (account: Account) => Account) => void | Promise<boolean> }>;
export function CreditCardDetail({ account, onBack, onEdit, onDelete, onArchive, onChange }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const terms = account.creditCard!;
  const warnings = creditCardWarnings(account);
  const due = new Date(`${account.nextPayoutDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <>
    <button className="btn ghost small" onClick={onBack}>← Accounts</button>
    <div className="card" style={{ ...accountCardStyle(account.colour), marginTop: 12, cursor: "default" }}><div className="row"><span className="prov">{displayProvider(account.provider)}</span><span>Credit card</span></div>{account.label ? <div className="meta">{account.label}</div> : null}<div className="bal">{gbp(account.balance)}</div><span>owed</span></div>
    <p className="muted">Debt is kept separate from your money and income. Update the amount owed when your provider confirms a change.</p>
    <section className="panel" aria-label="Credit card payment plan"><h1>Your payment plan</h1><dl className="investment-stats"><div><dt>APR</dt><dd>{terms.apr}%</dd></div><div><dt>Minimum payment due</dt><dd>{gbp(terms.minimumPayment)}</dd></div><div><dt>Planned payment</dt><dd>{terms.plannedPayment === undefined ? "Not set" : gbp(terms.plannedPayment)}</dd></div><div><dt>Payment due date</dt><dd>{due}</dd></div></dl>
      <p className="muted">Your statement supplies the minimum payment. APR alone does not tell us the exact interest charge or a payoff date.</p><p className="muted">This plan does not schedule a payment or reduce the amount owed.</p>
      {terms.statementPaid ? <p role="status">Statement marked paid. Enter the next statement's due date to start its reminder.</p> : <p className="muted">After paying your provider, mark this statement paid to stop its reminders. Your recorded debt stays unchanged until you update it.</p>}
      {onChange && <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { if (await onChange(current => { if (current.nextPayoutDate !== account.nextPayoutDate || JSON.stringify(current.creditCard) !== JSON.stringify(account.creditCard)) throw Object.assign(new Error("Statement changed"), { name: "StaleAccountEdit" }); const { statementPaid: _paid, ...unpaid } = current.creditCard!; return { ...current, creditCard: terms.statementPaid ? unpaid : { ...unpaid, statementPaid: true } }; }) === false) setError("Could not update this statement. Retry."); }
        catch { setError("Could not update this statement. Retry."); }
        finally { setBusy(false); }
      }}>{terms.statementPaid ? "Reopen statement reminder" : "Mark statement paid"}</button>}
      {warnings.length ? <ul className="muted" aria-label="Payment plan notes">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
    </section>
    {error ? <p role="alert" className="err">{error}</p> : null}
    <div className="row-gap"><button className="btn" disabled={busy} onClick={onEdit}>Edit credit card</button>{onArchive && <button className="btn ghost" disabled={busy} onClick={onArchive}>Archive account</button>}<button className="btn danger" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { if (await onDelete() === false) setError("Could not remove this credit card. Keep Drip open and retry."); }
      catch { setError("Could not remove this credit card. Keep Drip open and retry."); }
      finally { setBusy(false); }
    }}>{busy ? "Removing…" : "Delete"}</button></div>
  </>;
}
