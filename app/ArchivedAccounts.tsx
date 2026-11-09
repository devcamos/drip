"use client";
import { useState } from "react";
import type { Account } from "@/lib/types";
import { gbp } from "@/lib/maths";
import { displayProvider } from "@/lib/products";

export function ArchivedAccounts({ accounts, onBack, onRestore, onDelete }: Readonly<{ accounts: Account[]; onBack: () => void; onRestore: (id: string) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }>) {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  async function perform(id: string, work: (id: string) => Promise<boolean>) {
    setBusy(id); setError("");
    try { if (!await work(id)) setError("Could not save this change. Your archived records are kept; retry."); }
    catch { setError("Could not save this change. Your archived records are kept; retry."); }
    finally { setBusy(null); }
  }
  return <>
    <button className="btn ghost small" onClick={onBack}>← Settings</button><h1>Archived accounts</h1>
    <p className="muted">History stays encrypted and is included in cloud recovery and file backups. Archived accounts add nothing to your current balance, predictions or reminders. Received dividends stay in your portfolio history.</p>
    {!accounts.length && <p>No archived accounts.</p>}
    {accounts.map(account => { const name = account.holdingName ?? displayProvider(account.provider); const history = account.payouts.filter(payment => payment.kind === "actual"); return <section className="panel" key={account.id} aria-label={`Archived ${name}`}><h2>{name}</h2><p className="muted">Last recorded value {gbp(account.balance)} · Archived {new Date(account.archivedAt!).toLocaleDateString("en-GB")}</p><details><summary>Recorded income · {gbp(history.reduce((sum, payment) => sum + payment.amount, 0))}</summary>{history.length ? <ul>{history.map((payment, index) => <li key={index}>{payment.date} · {gbp(payment.amount)} · {payment.incomeType ?? account.rateType}</li>)}</ul> : <p>No received income recorded.</p>}</details><div className="row-gap"><button className="btn" disabled={!!busy} onClick={() => void perform(account.id, onRestore)} aria-label={`Restore ${name}`}>Restore account</button><button className="btn danger" disabled={!!busy} onClick={() => void perform(account.id, onDelete)} aria-label={`Permanently delete ${name}`}>Delete permanently</button></div></section>; })}
    {error && <p role="alert" className="err">{error}</p>}
  </>;
}
