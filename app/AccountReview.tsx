"use client";
import { useState } from "react";
import type { Account } from "@/lib/types";
import { accountReviewFields } from "@/lib/account-review";
import { gbp } from "@/lib/maths";

const formatDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
function currentValue(account: Account, key: ReturnType<typeof accountReviewFields>[number]["key"]) {
  if (key === "balanceReviewedAt") return gbp(account.balance);
  if (key === "rateReviewedAt") return account.creditCard ? `${account.creditCard.apr}% APR` : `${account.ratePct}% ${account.rateType === "dividend" ? "yield" : "AER"}`;
  return formatDate(account.nextPayoutDate);
}

export function AccountReviewPanel({ account, today, onConfirm }: Readonly<{ account: Account; today: string; onConfirm: () => boolean | void | Promise<boolean | void> }>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fields = accountReviewFields(account, today);
  return <section className="panel" aria-label="Review your figures">
    <h2 style={{ marginTop: 0 }}>Review your figures</h2>
    <p className="muted">Compare these saved figures with your provider. Drip doesn&apos;t check or verify them for you.</p>
    <ul className="list">{fields.map(field => <li key={field.key}>
      <span>{field.label}<br/><b>{currentValue(account, field.key)}</b><br/><span className="muted">{field.lastReviewedAt ? `Last confirmed ${formatDate(field.lastReviewedAt)}` : "Not confirmed yet"}</span></span>
      <span>{field.due ? <b className="err">Review due</b> : <b className="ok">Up to date</b>}{field.dueDate ? <><br/><span className="muted">Due {formatDate(field.dueDate)}</span></> : null}</span>
    </li>)}</ul>
    <button className="btn small" disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        if (await onConfirm() === false) setMessage("Could not save the review. Keep Drip open and try again.");
        else setMessage("Review saved securely.");
      } catch { setMessage("Could not save the review. Keep Drip open and try again."); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : "I’ve checked these figures"}</button>
    {message ? <p role="status" className="muted">{message}</p> : null}
  </section>;
}
