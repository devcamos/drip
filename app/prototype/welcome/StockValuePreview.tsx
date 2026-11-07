"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parseFxRate } from "@/lib/exchange-rates";
import { formatGBP } from "./CreditCardPreview";
import { estimateStockValue, sampleStockHolding, validSharePrice, type StockPriceInput } from "./stock-valuation";
import s from "./stock-price.module.css";

const usd = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", maximumFractionDigits: 10 });

export default function StockValuePreview({ input, onUse }: { input: StockPriceInput | null; onUse: (input: StockPriceInput | null) => void }) {
  const priceId = useId();
  const [price, setPrice] = useState(input?.priceUSD ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const estimate = estimateStockValue(input);
  useEffect(() => () => pending.current?.abort(), []);

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!validSharePrice(price)) { setError("Enter a positive USD share price, for example 60.00."); return; }
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setBusy(true); setError("");
    try {
      let fx = input && parseFxRate(input.fx, "USD");
      if (!fx) {
        // Only a public currency pair is sent. The server never forwards cookies or holding data.
        const response = await fetch("/api/exchange-rates?base=USD", { credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("unavailable");
        fx = parseFxRate(await response.json(), "USD");
      }
      if (!fx || !estimateStockValue({ priceUSD: price, fx })) throw new Error("unavailable");
      if (!controller.signal.aborted) onUse({ priceUSD: price, fx });
    } catch {
      if (!controller.signal.aborted) setError("Could not calculate a GBP value. Try again when a recent exchange rate is available. Your last value is unchanged.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function edit(value: string) { pending.current?.abort(); setBusy(false); setError(""); setPrice(value); }
  function useRecorded() { edit(""); onUse(null); }

  return <aside className={s.recorded} aria-labelledby="recorded-holding-heading">
    <p className={s.eyebrow}>YOUR HOLDING · GBP</p><h3 id="recorded-holding-heading">Your recorded holding</h3>
    <div className={s.recordedValue}><span>{estimate ? "Estimated market value" : "Recorded holding value"}</span><strong>{formatGBP(estimate?.valueGBP ?? sampleStockHolding.recordedValueGBP)}</strong><small>{estimate ? "From your entered price · Applied to this demo" : "£2,500.00 recorded · No price applied"}</small></div>
    <form className={s.priceForm} noValidate onSubmit={apply}>
      <label htmlFor={priceId}>Current price per share (USD)</label><input id={priceId} inputMode="decimal" maxLength={30} placeholder="e.g. 60.00" value={price} onChange={event => edit(event.target.value)} aria-describedby={`${priceId}-help`} aria-invalid={error.startsWith("Enter") ? true : undefined} />
      <p id={`${priceId}-help`}>Enter a price from your provider. Chart prices aren’t imported automatically.</p>
      <button className={s.applyPrice} disabled={busy}>{busy ? "Getting daily rate…" : "Update demo value"}</button>
      {error ? <p role="alert" className={s.valueError}>{error}</p> : null}
    </form>
    {estimate ? <div className={s.valuationBreakdown} aria-label="Applied price calculation"><p>50 shares × {usd.format(estimate.priceUSD)} × {estimate.fx.rate} USD→GBP</p><p>Frankfurter · Rate dated {estimate.fx.date}</p><p><b>Capital return</b><strong data-negative={estimate.capital.amount < 0}>{formatGBP(estimate.capital.amount)}{estimate.capital.percent !== null ? ` (${estimate.capital.percent.toFixed(2)}%)` : ""}</strong></p><button className={s.hideButton} onClick={useRecorded}>Use recorded value</button></div> : null}
    <dl className={s.holdingStats}><div><dt>Shares</dt><dd>50</dd></div><div><dt>Average purchase price</dt><dd>£48.00</dd></div><div><dt>Recorded dividend yield</dt><dd>5.40%</dd></div><div><dt>Estimated annual income</dt><dd>£135.00</dd></div></dl>
    <p className={s.currencyNote}><b>{estimate ? "Value moves. Income stays separate." : "One share price. Your whole holding."}</b>{estimate ? "The card and money total use this estimate. Your £2,500 recorded balance, purchase cost and dividend income stay unchanged." : "50 shares × a USD share price × the daily GBP exchange rate. Apply a price to try it in the cards and money total."} Daily reference rates can differ from your broker. Changes last only in this demo.</p>
  </aside>;
}
