"use client";

import { useRef, useState } from "react";
import type { Account } from "@/lib/types";
import { creditCardDraft, creditCardWarnings, validateCreditCardDraft } from "@/lib/credit-card";
import { normaliseColour } from "@/lib/account-colour";
import { CREDIT_CARD_PROVIDERS } from "@/lib/products";
import * as M from "@/lib/maths";
import { useUnsavedDraft } from "./useDraftGuard";

type Draft = ReturnType<typeof creditCardDraft>;
type Props = Readonly<{ existing?: Account; onSave: (account: Account) => Promise<boolean> | boolean | void; onCancel: () => void }>;
const colours = { Copper: "#b85a2a", Ocean: "#176b9a", Forest: "#006a4d", Plum: "#6b2d83", Slate: "#4a5070" };

export function CreditCardForm({ existing, onSave, onCancel }: Props) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID());
  const [provider, setProvider] = useState(existing?.provider ?? "");
  const [customProvider, setCustomProvider] = useState(() => !!existing?.provider && !(CREDIT_CARD_PROVIDERS as readonly string[]).includes(existing.provider));
  const [label, setLabel] = useState(existing?.label ?? "");
  const [colour, setColour] = useState(normaliseColour(existing?.colour ?? "#6b4052"));
  const [draft, setDraft] = useState<Draft>(() => existing ? creditCardDraft(existing) : { balance: "", apr: "", minimumPayment: "", plannedPayment: "", paymentDate: M.addMonths(M.ymd(new Date()), 1) });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft | "provider", string>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useUnsavedDraft({ provider, label, colour, draft });
  const fields: { key: keyof Draft; label: string; hint: string }[] = [
    { key: "balance", label: "Amount owed (£)", hint: "The balance on your latest credit card statement." },
    { key: "apr", label: "APR (%)", hint: "Use the rate from your provider, including 0% offers." },
    { key: "minimumPayment", label: "Statement minimum payment (£)", hint: "Copy your provider’s minimum for this statement." },
    { key: "plannedPayment", label: "Planned payment (£, optional)", hint: "A plan only; this does not make or schedule a payment." },
    { key: "paymentDate", label: "Payment due date", hint: "The date on your statement, kept separately for this card." },
  ];
  const result = validateCreditCardDraft(draft);
  const candidate: Account | undefined = result.value ? {
    id, provider: provider.trim(), label: label.trim(), colour,
    productCategory: "credit-card", taxWrapper: "none", rateType: "interest", ratePct: 0,
    frequency: "monthly", reinvestIncome: false, payouts: [], events: existing?.events ?? [],
    createdAt: existing?.createdAt ?? new Date().toISOString(), ...result.value,
  } : undefined;
  if (candidate && existing?.creditCard?.statementPaid && candidate.nextPayoutDate === existing.nextPayoutDate) candidate.creditCard = { ...candidate.creditCard!, statementPaid: true };
  const warnings = candidate ? creditCardWarnings(candidate) : [];

  return <>
    <h1>{existing ? "Edit credit card" : "Add credit card"}</h1>
    <p className="muted">Track the amount owed and your payment plan using your provider’s figures.</p>
    <form ref={form} noValidate onSubmit={async event => {
      event.preventDefault();
      const checked = validateCreditCardDraft(draft);
      const nextErrors = { ...checked.errors, ...(!provider.trim() || provider.trim().length > 100 ? { provider: "Enter a credit card provider, using 100 characters or fewer." } : {}) };
      setErrors(nextErrors); setMessage("");
      if (!checked.value || Object.keys(nextErrors).length || !candidate) { requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()); return; }
      setBusy(true);
      try {
        const next = existing && checked.value.balance !== existing.balance
          ? M.applySetBalance({ ...candidate, balance: existing.balance }, checked.value.balance, M.ymd(new Date())) : candidate;
        if (await onSave(next) === false) setMessage("Could not save this credit card. Your saved figures are unchanged; keep Drip open and retry.");
      } catch { setMessage("Could not save this credit card. Your saved figures are unchanged; keep Drip open and retry."); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="credit-provider">Credit card provider</label>
      <select disabled={busy} id="credit-provider" value={customProvider ? "__other__" : provider} aria-invalid={!!errors.provider} aria-describedby={errors.provider ? "credit-provider-error" : undefined} onChange={event => { const custom = event.target.value === "__other__"; setCustomProvider(custom); setProvider(custom ? "" : event.target.value); setErrors(previous => ({ ...previous, provider: undefined })); }}>
        <option value="">Choose a provider</option>
        {CREDIT_CARD_PROVIDERS.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="__other__">Other provider</option>
      </select>
      {customProvider && <><label htmlFor="credit-provider-other">Provider name</label><input disabled={busy} id="credit-provider-other" value={provider} maxLength={100} autoComplete="off" aria-invalid={!!errors.provider} aria-describedby={errors.provider ? "credit-provider-error" : undefined} onChange={event => { setProvider(event.target.value); setErrors(previous => ({ ...previous, provider: undefined })); }} /></>}
      {errors.provider ? <p id="credit-provider-error" className="err">{errors.provider}</p> : null}
      <label htmlFor="credit-label">Nickname (optional, this device only)</label>
      <input disabled={busy} id="credit-label" value={label} maxLength={100} autoComplete="off" onChange={event => setLabel(event.target.value)} />
      {fields.map(field => <div key={field.key}>
        <label htmlFor={`credit-${field.key}`}>{field.label}</label>
        <input disabled={busy} id={`credit-${field.key}`} type={field.key === "paymentDate" ? "date" : "text"} inputMode={field.key === "paymentDate" ? undefined : "decimal"} autoComplete="off" value={draft[field.key]} aria-invalid={!!errors[field.key]} aria-describedby={`credit-${field.key}-hint${errors[field.key] ? ` credit-${field.key}-error` : ""}`} onChange={event => { setDraft(previous => ({ ...previous, [field.key]: event.target.value })); setErrors(previous => ({ ...previous, [field.key]: undefined })); }} />
        <p className="muted" id={`credit-${field.key}-hint`}>{field.hint}</p>
        {errors[field.key] ? <p className="err" id={`credit-${field.key}-error`}>{errors[field.key]}</p> : null}
      </div>)}
      <fieldset disabled={busy} className="panel"><legend>Card colour</legend><div className="row-gap" role="group" aria-label="Card colour">{Object.entries(colours).map(([name, hex]) => <button key={name} type="button" className={`btn ghost small${colour === hex ? " on" : ""}`} aria-pressed={colour === hex} onClick={() => setColour(hex)}>{name}</button>)}</div><label htmlFor="credit-colour">Custom colour</label><input id="credit-colour" type="color" value={colour} onChange={event => setColour(normaliseColour(event.target.value))} /><p className="muted">Drip makes a gradient from your colour.</p></fieldset>
      {warnings.length ? <ul className="panel muted" aria-label="Credit card notes">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
      {message ? <p role="alert" className="err">{message}</p> : null}
      <div className="row-gap"><button disabled={busy} type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button disabled={busy} type="submit" className="btn">{busy ? "Saving…" : existing ? "Save changes" : "Add credit card"}</button></div>
    </form>
  </>;
}
