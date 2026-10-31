"use client";
import { useEffect, useId, useRef, useState } from "react";
import { convertedHolding, parseFxRate, type FxCurrency, type FxRate } from "@/lib/exchange-rates";
import { formatShares } from "@/lib/stock-investment";
import { gbp } from "@/lib/maths";
const sharePrice = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function CurrencyEstimate({ currency, shares }: Readonly<{ currency: FxCurrency; shares: number }>) {
  const id = useId();
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState<FxRate>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const usable = rate && parseFxRate(rate, currency);
  const estimate = usable ? convertedHolding(price, shares, usable.rate) : null;
  async function convert() {
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setBusy(true); setError("");
    try {
      // Same-origin credentials also allow Vercel-protected Previews. The
      // server never forwards these cookies to the public rate provider.
      const response = await fetch(`/api/exchange-rates?base=${currency}`, { credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error("unavailable");
      const quote = parseFxRate(await response.json(), currency);
      if (!quote) throw new Error("unavailable");
      if (!controller.signal.aborted) setRate(quote);
    } catch {
      if (!controller.signal.aborted) setError("Could not refresh the daily rate. Your saved balance is unchanged.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <details className="currency-estimate"><summary>Convert a share price to GBP</summary>
    <p className="muted">Enter your latest share price. Frankfurter supplies the daily exchange rate.</p>
    <label htmlFor={id}>Current price per share ({currency})</label>
    <input id={id} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 60.00" />
    <button type="button" className="btn ghost" disabled={busy || !convertedHolding(price, shares, 1)} onClick={convert}>{busy ? "Getting daily rate…" : rate ? "Refresh conversion" : "Convert to GBP"}</button>
    {usable && <p className="muted">Frankfurter · Rate dated {usable.date} · 1 {currency} = {usable.rate.toFixed(5)} GBP</p>}
    {rate && !usable && <p role="status">This exchange rate is too old. Refresh it to calculate an estimate.</p>}
    {estimate && <output className="currency-result" aria-label="Converted holding estimate"><span>Estimated value in GBP</span><strong>{gbp(estimate.valueGBP)}</strong><span>{formatShares(shares)} shares · ≈ {sharePrice.format(estimate.perShareGBP)} per share</span></output>}
    {error && <p className="err" role="alert">{error}{usable && " Showing the previously loaded, dated rate."}</p>}
    <p className="muted">Estimate only. Use Update balance to record a new value. Your original GBP purchase cost and dividend predictions are kept. Daily rates may differ from your broker.</p>
  </details>;
}
