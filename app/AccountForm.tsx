"use client";
import { useState } from "react";
import type { Account, Frequency, ProductCategory, RateType, TaxWrapper } from "@/lib/types";
import { PRODUCTS, PROVIDERS, validDate } from "@/lib/products";
import * as M from "@/lib/maths";
const today = () => M.ymd(new Date());

export function AccountForm({ existing, onSave, onCancel }: Readonly<{ existing?: Account; onSave: (a: Account) => void; onCancel: () => void }>) {
  const [provider, setProvider] = useState(existing?.provider ?? "Zopa");
  const [custom, setCustom] = useState(existing && !(existing.provider in PROVIDERS) ? existing.provider : "");
  const [category, setCategory] = useState<ProductCategory>(existing?.productCategory ?? (existing ? "other" : "easy-access"));
  const [wrapper, setWrapper] = useState<TaxWrapper>(existing?.taxWrapper ?? (existing?.productCategory === "cash-isa" ? "cash-isa" : "none"));
  const [label, setLabel] = useState(existing?.label ?? "");
  const [balance, setBalance] = useState(existing ? String(existing.balance) : "");
  const [rate, setRate] = useState(existing ? String(existing.ratePct) : "");
  const [rateType, setRateType] = useState<RateType>(existing?.rateType ?? "interest");
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "monthly");
  const [reinvest, setReinvest] = useState(existing?.reinvestIncome ?? existing?.rateType !== "dividend");
  const [next, setNext] = useState(existing?.nextPayoutDate ?? M.addMonths(today(), 1));
  const [rateFrom, setRateFrom] = useState(today());
  const [hasBonus, setHasBonus] = useState(!!existing?.bonus);
  const [bonusAmount, setBonusAmount] = useState(existing?.bonus ? String(existing.bonus.amount) : "");
  const [bonusDate, setBonusDate] = useState(existing?.bonus?.expectedDate ?? "");
  const isOther = provider === "Other" || (!!existing && !(existing.provider in PROVIDERS) && provider === existing.provider);
  const b = Number(balance), r = Number(rate);
  const rateChanged = !!existing && r !== existing.ratePct;
  const valid = Number.isFinite(b) && b >= 0 && balance.trim() !== "" && Number.isFinite(r) && r >= 0 && r < 100 && rate.trim() !== "" &&
    (frequency === "daily" || validDate(next)) && (!isOther || !!custom.trim()) && (!rateChanged || validDate(rateFrom)) &&
    (!hasBonus || (Number.isFinite(Number(bonusAmount)) && M.round2(Number(bonusAmount)) > 0 && validDate(bonusDate)));
  const chooseCategory = (value: ProductCategory) => {
    const defaults = PRODUCTS[value]; setCategory(value); setWrapper(defaults.taxWrapper); setRateType(defaults.rateType);
    setFrequency(defaults.frequency); setReinvest(defaults.reinvestIncome);
  };
  return <>
    <h1>{existing ? "Edit account" : "Add account"}</h1>
    <form onSubmit={event => {
      event.preventDefault(); if (!valid) return;
      const name = isOther ? custom.trim() : provider;
      const createdAt = existing?.createdAt ?? new Date().toISOString();
      const base: Account = { ...existing, id: existing?.id ?? crypto.randomUUID(), provider: name, label: label.trim(), balance: M.round2(b), ratePct: existing?.ratePct ?? r, rateType,
        productCategory: category, taxWrapper: wrapper, reinvestIncome: reinvest, frequency, nextPayoutDate: frequency === "daily" ? today() : next,
        bonus: hasBonus ? { amount: M.round2(Number(bonusAmount)), expectedDate: bonusDate } : undefined,
        colour: PROVIDERS[name] ?? PROVIDERS.Other, payouts: existing?.payouts ?? [], events: existing?.events ?? [], createdAt,
        rateHistory: existing?.rateHistory ?? [{ from: createdAt.slice(0, 10), ratePct: r }] };
      const account = rateChanged ? M.applyRateChange(base, r, rateFrom, today()) : base;
      onSave(existing && b !== existing.balance ? M.applySetBalance(account, b, today()) : account);
    }}>
      <label htmlFor="account-category">Product category</label>
      <select id="account-category" value={category} onChange={e => chooseCategory(e.target.value as ProductCategory)}>{Object.entries(PRODUCTS).map(([value, product]) => <option value={value} key={value}>{product.label}</option>)}</select>
      <p className="muted">Sets calculation defaults for any provider. You can change the payment schedule below.</p>
      <label htmlFor="account-provider">Provider</label>
      <select id="account-provider" value={isOther ? "Other" : provider} onChange={e => setProvider(e.target.value)}>{Object.keys(PROVIDERS).map(p => <option key={p}>{p}</option>)}</select>
      {isOther && <><label htmlFor="custom-provider">Provider name</label><input id="custom-provider" value={custom} onChange={e => setCustom(e.target.value)} /></>}
      {category === "stocks-funds" && <label className="check-label"><input type="checkbox" checked={wrapper === "stocks-shares-isa"} onChange={e => setWrapper(e.target.checked ? "stocks-shares-isa" : "none")} />Held in a Stocks &amp; Shares ISA</label>}
      <label htmlFor="account-nickname">Nickname (optional, never synced to cloud)</label><input id="account-nickname" aria-label="Nickname" value={label} maxLength={40} onChange={e => setLabel(e.target.value)} placeholder="e.g. Rainy day pot" />
      <div className="grid">
        <div><label htmlFor="account-balance">Balance £</label><input id="account-balance" inputMode="decimal" aria-label="Balance" value={balance} onChange={e => setBalance(e.target.value)} placeholder="3000" /></div>
        <div><label htmlFor="account-rate">{rateType === "dividend" ? "Expected dividend yield % a year" : "Standard interest rate % a year"}</label><input id="account-rate" inputMode="decimal" aria-label="Rate" value={rate} onChange={e => setRate(e.target.value)} placeholder="7" /></div>
        {category === "other" && <div><label htmlFor="account-type">Income type</label><select id="account-type" aria-label="Type" value={rateType} onChange={e => { const value = e.target.value as RateType; setRateType(value); setReinvest(value === "interest"); }}><option value="interest">Interest</option><option value="dividend">Dividend</option></select></div>}
        <div><label htmlFor="account-paid">Paid</label><select id="account-paid" value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Yearly</option></select></div>
      </div>
      {rateChanged && <><label htmlFor="rate-from">New rate applies from</label><input id="rate-from" type="date" value={rateFrom} onChange={e => setRateFrom(e.target.value)} /></>}
      {frequency !== "daily" ? <><label htmlFor="next-payout">Next payout date</label><input id="next-payout" type="date" value={next} onChange={e => setNext(e.target.value)} /></>
        : <p className="muted">Daily payments need no payout date. Predictions never change your saved balance.</p>}
      <label className="check-label"><input type="checkbox" checked={reinvest} onChange={e => setReinvest(e.target.checked)} />Reinvest predicted income</label>
      <p className="muted">Your balance is the amount you enter. Keep it up to date using your provider&apos;s figures. Use the standard rate here, excluding any deferred bonus.</p>
      <label className="check-label"><input type="checkbox" checked={hasBonus} onChange={e => setHasBonus(e.target.checked)} />Track a pending bonus</label>
      {hasBonus && <fieldset className="panel"><legend>Pending bonus</legend>
        <label htmlFor="bonus-amount">Pending bonus amount £</label><input id="bonus-amount" inputMode="decimal" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} />
        <label htmlFor="bonus-date">Expected bonus payment date</label><input id="bonus-date" type="date" value={bonusDate} onChange={e => setBonusDate(e.target.value)} />
        <p className="muted">Enter your provider&apos;s accrued amount or your own estimate. Drip predicts this amount once on the expected date; it doesn&apos;t calculate eligibility or further bonus accrual.</p>
      </fieldset>}
      {valid && <p className="muted">≈ {M.gbp(M.monthlyIncome(b, r))} a month</p>}
      <div className="row-gap"><button className="btn" type="submit" disabled={!valid}>Save</button><button className="btn ghost" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  </>;
}
