"use client";

import { useState } from "react";
import type { Account } from "@/lib/types";
import { accountCardStyle } from "@/lib/account-colour";
import { creditCardWarnings } from "@/lib/credit-card";
import { gbp } from "@/lib/maths";
import { displayProvider } from "@/lib/products";

type Props = Readonly<{ account: Account; onBack: () => void; onEdit: () => void; onDelete: () => void | Promise<boolean> }>;
export function CreditCardDetail({ account, onBack, onEdit, onDelete }: Props) {
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
      {warnings.length ? <ul className="muted" aria-label="Payment plan notes">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
    </section>
    {error ? <p role="alert" className="err">{error}</p> : null}
    <div className="row-gap"><button className="btn" disabled={busy} onClick={onEdit}>Edit credit card</button><button className="btn danger" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { if (await onDelete() === false) setError("Could not remove this credit card. Keep Drip open and retry."); }
      catch { setError("Could not remove this credit card. Keep Drip open and retry."); }
      finally { setBusy(false); }
    }}>{busy ? "Removing…" : "Delete"}</button></div>
  </>;
}
