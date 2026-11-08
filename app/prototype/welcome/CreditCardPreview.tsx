"use client";

import { useEffect, useId, useRef, useState } from "react";
import { creditCardDraft, creditCardWarnings, validateCreditCard } from "./credit-card";
import type { CreditCard, CreditCardDraft } from "./credit-card";
import s from "./welcome.module.css";

const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const formatGBP = (value: number) => currency.format(value);
function paymentDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function CreditCardEditor({ name, card, onSave, onClose }: { name: string; card: CreditCard; onSave: (card: CreditCard) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fieldId = useId();
  const [draft, setDraft] = useState(() => creditCardDraft(card));
  const [errors, setErrors] = useState<Partial<Record<keyof CreditCardDraft, string>>>({});
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  const fields: { name: keyof CreditCardDraft; label: string; hint: string }[] = [
    { name: "balance", label: "Amount owed (£)", hint: "The balance shown by your credit card provider." },
    { name: "apr", label: "APR (%)", hint: "Your provider’s annual percentage rate, including 0% offers." },
    { name: "minimumPayment", label: "Statement minimum payment (£)", hint: "Copy the minimum due for this statement. Drip doesn’t calculate it." },
    { name: "plannedPayment", label: "Planned payment (£, optional)", hint: "Your plan only. Leave blank if you haven’t decided." },
    { name: "paymentDate", label: "Payment due date", hint: "The due date on your statement." },
  ];
  const validDraft = validateCreditCard(draft).card;
  const warnings = validDraft ? creditCardWarnings(validDraft) : [];
  return <dialog ref={dialog} className={`${s.chooser} ${s.creditEditor}`} aria-labelledby="credit-editor-heading" onCancel={onClose}>
    <div className={s.sectionHeading}><span className={s.eyebrow}>{name.toUpperCase()} · SAMPLE</span><button className={s.closeButton} onClick={onClose} aria-label="Close credit card editor">×</button></div>
    <h2 id="credit-editor-heading">Edit credit card</h2><p>Keep the figures from your statement together. Changes stay in this demo.</p>
    <form noValidate onSubmit={event => {
      event.preventDefault();
      const result = validateCreditCard(draft);
      setErrors(result.errors);
      if (result.card) onSave(result.card);
      else {
        const first = fields.find(field => result.errors[field.name]);
        if (first) event.currentTarget.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      }
    }}>
      <div className={s.creditFields}>{fields.map(field => <div className={s.creditField} key={field.name}>
        <label htmlFor={`${fieldId}-${field.name}`}>{field.label}</label>
        <input id={`${fieldId}-${field.name}`} name={field.name} type={field.name === "paymentDate" ? "date" : "text"} inputMode={field.name === "paymentDate" ? undefined : "decimal"} autoComplete="off" value={draft[field.name]} aria-invalid={!!errors[field.name]} aria-describedby={`${fieldId}-${field.name}-hint${errors[field.name] ? ` ${fieldId}-${field.name}-error` : ""}`} onChange={event => { setDraft(previous => ({ ...previous, [field.name]: event.target.value })); setErrors(previous => ({ ...previous, [field.name]: undefined })); }} />
        <p id={`${fieldId}-${field.name}-hint`}>{field.hint}</p>
        {errors[field.name] ? <p className={s.fieldError} role="alert" id={`${fieldId}-${field.name}-error`}>{errors[field.name]}</p> : null}
      </div>)}</div>
      {warnings.length ? <ul className={s.creditWarnings} aria-label="Credit card notes">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
      <p className={s.creditFormNote}>Saving a plan won’t make a payment or reduce the amount owed. Update the balance when your provider confirms a change.</p>
      <div className={s.editorActions}><button className={s.secondary} type="button" onClick={onClose}>Cancel</button><button className={s.primary} type="submit">Save changes</button></div>
    </form>
  </dialog>;
}

export function CreditCardPreview({ card, open, onToggle, onChange, id = "credit", name = "Barclaycard" }: { card: CreditCard; open: boolean; onToggle: () => void; onChange: (card: CreditCard) => void; id?: string; name?: string }) {
  const [editing, setEditing] = useState(false);
  const editTrigger = useRef<HTMLButtonElement>(null);
  function closeEditor() { setEditing(false); requestAnimationFrame(() => editTrigger.current?.focus()); }
  return <>
    <article className={`${s.accountCard} ${s.debtCard} ${open ? s.cardOpen : ""}`}>
      <button className={s.cardTrigger} aria-expanded={open} aria-controls={`example-${id}`} onClick={onToggle}><span className={s.providerLogo}>{name[0]}</span><span className={s.cardTitle}>{name}<small>Credit card · Repayments</small></span><span className={s.cardValue}>{formatGBP(card.balance)}<small className={s.owedLabel}>owed</small></span></button>
      <div className={s.cardDetails} id={`example-${id}`} hidden={!open}>
        <dl><div><dt>APR</dt><dd>{card.apr}%</dd></div><div><dt>Statement minimum payment</dt><dd>{formatGBP(card.minimumPayment)}</dd></div><div><dt>Planned payment</dt><dd>{card.plannedPayment === undefined ? "Not set" : formatGBP(card.plannedPayment)}</dd></div><div><dt>Payment due date</dt><dd>{paymentDate(card.paymentDate)}</dd></div></dl>
        <p>Debt is tracked separately from money and income. APR alone doesn’t tell us the exact interest charge.</p>
        <button ref={editTrigger} className={s.editCreditButton} onClick={() => setEditing(true)}>Edit credit card <span aria-hidden="true">↗</span></button>
      </div>
    </article>
    {editing ? <CreditCardEditor name={name} card={card} onClose={closeEditor} onSave={next => { onChange(next); closeEditor(); }} /> : null}
  </>;
}

export function CreditCardPaymentSummary({ card, name = "Barclaycard", label = "Credit card payment plan" }: { card: CreditCard; name?: string; label?: string }) {
  const warnings = creditCardWarnings(card);
  return <section className={`${s.nextPayment} ${s.creditPayment}`} aria-label={label}>
    <div className={s.sectionHeading}><h2>Your payment plan</h2><span className={s.debtPill}>CREDIT CARD</span></div>
    <p className={s.paymentDue}>{name} · Due {paymentDate(card.paymentDate)}</p>
    <dl className={s.repaymentNumbers}><div><dt>Minimum payment due</dt><dd>{formatGBP(card.minimumPayment)}</dd></div><div><dt>Planned payment</dt><dd>{card.plannedPayment === undefined ? "Not set" : formatGBP(card.plannedPayment)}</dd></div></dl>
    {warnings.length ? <ul className={s.creditWarnings} aria-label="Payment plan notes">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
    <p>Your plan doesn’t change the amount owed. Interest, fees and payment timing depend on your provider. No payment is scheduled here.</p>
  </section>;
}
