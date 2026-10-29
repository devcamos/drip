"use client";
import { useRef, useState } from "react";
import type { Account, Frequency, ProductCategory, RateType, TaxWrapper } from "@/lib/types";
import { PRODUCTS, PROVIDERS, TRADING_212_HOLDINGS, displayProvider, validDate } from "@/lib/products";
import { accountCardStyle, normaliseColour } from "@/lib/account-colour";
import * as M from "@/lib/maths";
const today = () => M.ymd(new Date());
const payoutMonths: Record<Frequency, number> = { daily: 0, monthly: 1, quarterly: 3, annually: 12 };
const colourChoices = { Copper: "#b85a2a", Ocean: "#176b9a", Forest: "#006a4d", Plum: "#6b2d83", Slate: "#4a5070" };
function customProviderName(provider?: string) {
  if (!provider || Object.hasOwn(PROVIDERS, provider)) return "";
  return provider;
}
type FormInputs = { balance: string; rate: string; frequency: Frequency; next: string; provider: string; rateFrom?: string; bonus?: { amount: string; date: string } };
function validForm(input: FormInputs) {
  const balance = Number(input.balance), rate = Number(input.rate);
  if (!Number.isFinite(balance) || balance < 0 || !input.balance.trim()) return false;
  if (!Number.isFinite(rate) || rate < 0 || rate >= 100 || !input.rate.trim()) return false;
  if (!input.provider.trim() || (input.frequency !== "daily" && !validDate(input.next))) return false;
  if (input.rateFrom !== undefined && !validDate(input.rateFrom)) return false;
  return !input.bonus || (Number.isFinite(Number(input.bonus.amount)) && M.toPence(Number(input.bonus.amount)) > 0 && validDate(input.bonus.date));
}

function isCustomHolding(holding?: string) {
  return !!holding && !(TRADING_212_HOLDINGS as readonly string[]).includes(holding);
}
function isOtherProvider(provider: string, existing?: Account) {
  return provider === "Other" || (!!existing && !(existing.provider in PROVIDERS) && provider === existing.provider);
}
function initialValues(existing?: Account, category?: ProductCategory) {
  const fallbackProduct = existing ? "other" : "easy-access";
  const product = existing?.productCategory ?? category ?? fallbackProduct;
  const provider = existing?.provider ?? (product === "stocks-funds" ? "Trading212" : "Zopa");
  const defaults = PRODUCTS[product];
  return { product, provider, colour: normaliseColour(existing ? existing.colour : PROVIDERS[provider]),
    balance: existing ? String(M.fromPence(existing.balance)) : "", rate: existing ? String(existing.ratePct) : "",
    bonusAmount: existing?.bonus ? String(M.fromPence(existing.bonus.amount)) : "",
    reinvest: existing?.reinvestIncome ?? (existing ? existing.rateType !== "dividend" : defaults.reinvestIncome) };
}
function validHoldingName(category: ProductCategory, provider: string, custom: boolean, holding: string) {
  if (category !== "stocks-funds") return true;
  if (holding.length > 100) return false;
  return provider !== "Trading212" || !custom || !!holding.trim();
}

export function AccountForm({ existing, onSave, onCancel, initialCategory }: Readonly<{ existing?: Account; initialCategory?: ProductCategory; onSave: (a: Account) => void | Promise<boolean>; onCancel: () => void }>) {
  const initial = initialValues(existing, initialCategory);
  const initialProduct = initial.product;
  const initialProvider = initial.provider;
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [id] = useState(() => existing?.id ?? crypto.randomUUID());
  const [provider, setProvider] = useState(initialProvider);
  const [custom, setCustom] = useState(customProviderName(existing?.provider));
  const [category, setCategory] = useState<ProductCategory>(initialProduct);
  const [wrapper, setWrapper] = useState<TaxWrapper>(existing?.taxWrapper ?? PRODUCTS[initialProduct].taxWrapper);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [holding, setHolding] = useState(existing?.holdingName ?? "");
  const [customHolding, setCustomHolding] = useState(isCustomHolding(existing?.holdingName));
  const [colour, setColour] = useState(initial.colour);
  const [colourChosen, setColourChosen] = useState(!!existing);
  const [balance, setBalance] = useState(initial.balance);
  const [rate, setRate] = useState(initial.rate);
  const [rateType, setRateType] = useState<RateType>(existing?.rateType ?? PRODUCTS[initialProduct].rateType);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? PRODUCTS[initialProduct].frequency);
  const [reinvest, setReinvest] = useState(initial.reinvest);
  const [next, setNext] = useState(existing?.nextPayoutDate ?? M.addMonths(today(), payoutMonths[PRODUCTS[initialProduct].frequency]));
  const [rateFrom, setRateFrom] = useState(today());
  const [hasBonus, setHasBonus] = useState(!!existing?.bonus);
  const [bonusAmount, setBonusAmount] = useState(initial.bonusAmount);
  const [bonusDate, setBonusDate] = useState(existing?.bonus?.expectedDate ?? "");
  const isOther = isOtherProvider(provider, existing);
  const b = Number(balance), r = Number(rate);
  const rateChanged = !!existing && r !== existing.ratePct;
  const name = isOther ? custom.trim() : provider;
  const validHolding = validHoldingName(category, provider, customHolding, holding);
  const valid = validHolding && validForm({ balance, rate, frequency, next, provider: name, rateFrom: rateChanged ? rateFrom : undefined, bonus: hasBonus ? { amount: bonusAmount, date: bonusDate } : undefined });
  const chooseCategory = (value: ProductCategory) => {
    const defaults = PRODUCTS[value]; setCategory(value); setWrapper(defaults.taxWrapper); setRateType(defaults.rateType);
    setFrequency(defaults.frequency); setReinvest(defaults.reinvestIncome);
    setNext(M.addMonths(today(), payoutMonths[defaults.frequency]));
  };
  return <>
    <h1>{existing ? "Edit account" : "Add account"}</h1>
    <form onSubmit={async event => {
      event.preventDefault(); if (!valid || submitting.current) return;
      const createdAt = existing?.createdAt ?? new Date().toISOString();
      const balancePence = M.toPence(b);
      const bonusPence = hasBonus ? M.toPence(Number(bonusAmount)) : undefined;
      const base: Account = { ...existing, id, provider: name, label: label.trim(), holdingName: category === "stocks-funds" ? holding.trim() || undefined : undefined, balance: balancePence, currency: "GBP", ratePct: existing?.ratePct ?? r, rateType,
        productCategory: category, taxWrapper: wrapper, reinvestIncome: reinvest, frequency, nextPayoutDate: frequency === "daily" ? today() : next,
        bonus: hasBonus && bonusPence !== undefined ? { amount: bonusPence, expectedDate: bonusDate } : undefined,
        colour, payouts: existing?.payouts ?? [], events: existing?.events ?? [], createdAt,
        rateHistory: existing?.rateHistory ?? [{ from: createdAt.slice(0, 10), ratePct: r }] };
      const account = rateChanged ? M.applyRateChange(base, r, rateFrom, today()) : base;
      submitting.current = true; setBusy(true); setError("");
      try { if (await onSave(existing && balancePence !== existing.balance ? M.applySetBalance(account, balancePence, today()) : account) === false) setError("Could not save this account. Keep Drip open and retry."); }
      catch { setError("Could not save this account. Keep Drip open and retry."); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <label htmlFor="account-category">Product category</label>
      <select disabled={busy} id="account-category" value={category} onChange={e => chooseCategory(e.target.value as ProductCategory)}>{Object.entries(PRODUCTS).map(([value, product]) => <option value={value} key={value}>{product.label}</option>)}</select>
      <p className="muted">Sets calculation defaults for any provider. You can change the payment schedule below.</p>
      <label htmlFor="account-provider">Provider</label>
      <select disabled={busy} id="account-provider" value={isOther ? "Other" : provider} onChange={e => { setProvider(e.target.value); setCustomHolding(!!holding && !(TRADING_212_HOLDINGS as readonly string[]).includes(holding)); if (!colourChosen) setColour(normaliseColour(PROVIDERS[e.target.value])); }}>{Object.keys(PROVIDERS).map(p => <option key={p} value={p}>{displayProvider(p)}</option>)}</select>
      {isOther && <><label htmlFor="custom-provider">Provider name</label><input disabled={busy} id="custom-provider" value={custom} onChange={e => setCustom(e.target.value)} /></>}
      {category === "stocks-funds" && <>
        {provider === "Trading212" && <><label htmlFor="account-holding">Stock / fund</label><select disabled={busy} id="account-holding" value={customHolding ? "custom" : holding} onChange={e => { const custom = e.target.value === "custom"; setCustomHolding(custom); setHolding(custom ? "" : e.target.value); }}>
          <option value="">Whole account / no individual holding</option>
          {TRADING_212_HOLDINGS.map(stock => <option key={stock}>{stock}</option>)}
          <option value="custom">Other stock or fund</option>
        </select></>}
        {(provider !== "Trading212" || customHolding) && <><label htmlFor="holding-name">Stock / fund name{provider !== "Trading212" ? " (optional)" : ""}</label><input disabled={busy} id="holding-name" value={holding} maxLength={100} onChange={e => { setHolding(e.target.value); if (provider !== "Trading212") setCustomHolding(!!e.target.value && !(TRADING_212_HOLDINGS as readonly string[]).includes(e.target.value)); }} /></>}
        <p className="muted">Choose a holding or track the whole account. Enter your own balance, dividend yield and payment schedule below.</p>
      </>}
      {category === "stocks-funds" && <label className="check-label"><input disabled={busy} type="checkbox" checked={wrapper === "stocks-shares-isa"} onChange={e => setWrapper(e.target.checked ? "stocks-shares-isa" : "none")} />Held in a Stocks &amp; Shares ISA</label>}
      <label htmlFor="account-nickname">Nickname (optional, never synced to cloud)</label><input disabled={busy} id="account-nickname" aria-label="Nickname" value={label} maxLength={40} onChange={e => setLabel(e.target.value)} placeholder="e.g. Rainy day pot" />
      <fieldset className="account-colours"><legend>Account colour</legend>
        <div className="colour-choices">{Object.entries(colourChoices).map(([name, value]) => <button disabled={busy} key={name} type="button" className="colour-swatch" aria-label={`${name} account colour`} aria-pressed={colour === value} title={name} style={{ backgroundColor: value }} onClick={() => { setColour(value); setColourChosen(true); }} />)}</div>
        <div className="colour-custom"><label htmlFor="account-colour">Custom account colour</label><input disabled={busy} id="account-colour" type="color" value={colour} onChange={e => { setColour(e.target.value); setColourChosen(true); }} /><button disabled={busy} type="button" className="btn ghost small" onClick={() => { setColour(normaliseColour(PROVIDERS[name] ?? PROVIDERS.Other)); setColourChosen(false); }}>Use provider colour</button></div>
        <div className="card colour-preview" style={accountCardStyle(colour)} aria-label="Account card preview"><span className="prov">{displayProvider(name) || "Your account"}</span><div className="meta">{category === "stocks-funds" && holding.trim() ? holding.trim() : PRODUCTS[category].label}</div></div>
      </fieldset>
      <div className="grid">
        <div><label htmlFor="account-balance">Balance £</label><input disabled={busy} id="account-balance" inputMode="decimal" aria-label="Balance" value={balance} onChange={e => setBalance(e.target.value)} placeholder="3000" /></div>
        <div><label htmlFor="account-rate">{rateType === "dividend" ? "Expected dividend yield % a year" : "Standard interest rate % a year"}</label><input disabled={busy} id="account-rate" inputMode="decimal" aria-label="Rate" value={rate} onChange={e => setRate(e.target.value)} placeholder="7" /></div>
        {category === "other" && <div><label htmlFor="account-type">Income type</label><select disabled={busy} id="account-type" aria-label="Type" value={rateType} onChange={e => { const value = e.target.value as RateType; setRateType(value); setReinvest(value === "interest"); }}><option value="interest">Interest</option><option value="dividend">Dividend</option></select></div>}
        <div><label htmlFor="account-paid">Paid</label><select disabled={busy} id="account-paid" value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Yearly</option></select></div>
      </div>
      {rateChanged && <><label htmlFor="rate-from">New rate applies from</label><input disabled={busy} id="rate-from" type="date" value={rateFrom} onChange={e => setRateFrom(e.target.value)} /></>}
      {frequency !== "daily" ? <><label htmlFor="next-payout">Next payout date</label><input disabled={busy} id="next-payout" type="date" value={next} onChange={e => setNext(e.target.value)} /></>
        : <p className="muted">Daily payments need no payout date. Predictions never change your saved balance.</p>}
      <label className="check-label"><input disabled={busy} type="checkbox" checked={reinvest} onChange={e => setReinvest(e.target.checked)} />Reinvest predicted income</label>
      <p className="muted">Your balance is the amount you enter. Keep it up to date using your provider&apos;s figures. Use the standard rate here, excluding any deferred bonus.</p>
      <label className="check-label"><input disabled={busy} type="checkbox" checked={hasBonus} onChange={e => setHasBonus(e.target.checked)} />Track a pending bonus</label>
      {hasBonus && <fieldset className="panel"><legend>Pending bonus</legend>
        <label htmlFor="bonus-amount">Pending bonus amount £</label><input disabled={busy} id="bonus-amount" inputMode="decimal" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} />
        <label htmlFor="bonus-date">Expected bonus payment date</label><input disabled={busy} id="bonus-date" type="date" value={bonusDate} onChange={e => setBonusDate(e.target.value)} />
        <p className="muted">Enter your provider&apos;s accrued amount or your own estimate. Drip predicts this amount once on the expected date; it doesn&apos;t calculate eligibility or further bonus accrual.</p>
      </fieldset>}
      {valid && <p className="muted">≈ {M.gbp(M.monthlyIncome(M.toPence(b), r))} a month</p>}
      <div className="row-gap"><button className="btn" type="submit" disabled={!valid || busy}>{busy ? "Saving…" : "Save"}</button><button className="btn ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
      {error && <p role="alert" className="err">{error}</p>}
    </form>
  </>;
}
