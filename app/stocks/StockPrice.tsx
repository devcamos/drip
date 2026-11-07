"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Account } from "@/lib/types";
import { chartRanges, instrumentForHolding, stockChartDescriptor, validSharePriceInput, type ChartRange } from "@/lib/stock-chart";
import { parseFxRate, type FxRate } from "@/lib/exchange-rates";
import { applyMarketValuation, clearMarketValuation } from "@/lib/market-valuation";
import { averagePriceLabel, formatShares, investmentReturn } from "@/lib/stock-investment";
import * as M from "@/lib/maths";
import s from "./stock-price.module.css";

type Props = Readonly<{ account: Account; onChange: (change: (current: Account) => Account) => void | Promise<boolean>; onEdit: () => void; onBack: () => void }>;

export function StockPrice({ account, onChange, onEdit, onBack }: Props) {
  const instrument = instrumentForHolding(account.holdingName);
  const [open, setOpen] = useState(!!instrument);
  const [loaded, setLoaded] = useState(true);
  const [frameOpened, setFrameOpened] = useState(false);
  const [range, setRange] = useState<ChartRange>("1M");
  const [price, setPrice] = useState(account.marketValuation ? String(account.marketValuation.priceUSD) : "");
  const [busy, setBusy] = useState<"rate" | "save" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);
  const priceId = useId();
  const descriptor = instrument ? stockChartDescriptor(instrument.id, range) : null;
  const result = investmentReturn(account);
  const original = account.marketValuation?.recordedBalance ?? account.balance;
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
    if (!open) pending.current?.abort();
    return () => element?.close();
  }, [open]);
  useEffect(() => () => pending.current?.abort(), []);

  function close() {
    if (busy === "save") return;
    pending.current?.abort(); setBusy(null); setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function apply(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!validSharePriceInput(price)) { setError("Enter a positive USD share price, for example 60.00."); return; }
    if (!account.investment) { setError("Add your share quantity and purchase price before applying a value."); return; }
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setBusy("rate");
    try {
      const saved = account.marketValuation;
      let fx: FxRate | null = saved ? parseFxRate({ base: "USD", quote: "GBP", rate: saved.fxRate, date: saved.fxDate, source: "Frankfurter" }, "USD") : null;
      if (!fx) {
        const response = await fetch("/api/exchange-rates?base=USD", { credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("rate");
        fx = parseFxRate(await response.json(), "USD");
      }
      if (!fx) throw new Error("rate");
      if (controller.signal.aborted) return;
      const input = { priceUSD: Number(price), fxRate: fx.rate, fxDate: fx.date };
      const appliedAt = Date.now();
      // Validate against the visible holding before starting the guarded save.
      applyMarketValuation(account, input, appliedAt);
      setBusy("save");
      const accepted = await onChange(current => {
        if (current.holdingName !== account.holdingName || current.investment?.shares !== account.investment?.shares) throw Object.assign(new Error("Holding changed"), { name: "StaleAccountEdit" });
        return applyMarketValuation(current, input, appliedAt);
      });
      if (accepted === false) throw new Error("save");
      setMessage("Holding value saved. Your purchase cost and recorded dividend-income assumptions are unchanged.");
    } catch {
      if (!controller.signal.aborted) setError("Could not update this holding value. Your last saved value is kept; check the price and try again.");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }
  async function restoreRecorded() {
    setBusy("save"); setError(""); setMessage("");
    const restoredAt = Date.now();
    try {
      const accepted = await onChange(current => clearMarketValuation(current, restoredAt));
      if (accepted === false) throw new Error("save");
      setPrice(""); setMessage("Recorded value restored. Dividend income is unchanged.");
    } catch { setError("Could not restore the recorded value. Your last saved value is kept; retry."); }
    finally { setBusy(null); }
  }

  if (!instrument) return <p className="muted">A price-history chart is not configured for this holding. Use your provider’s figures to update its balance.</p>;
  return <>
    <button ref={trigger} className="btn ghost" onClick={() => setOpen(true)}>Explore share price <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} className={s.dialog} aria-labelledby="saved-stock-heading" onCancel={event => { if (busy === "save") event.preventDefault(); else close(); }}>
      <div className={s.topBar}><button className={s.backButton} disabled={busy === "save"} onClick={() => { pending.current?.abort(); onBack(); }}><span aria-hidden="true">← </span>Back to accounts</button><button className={s.backButton} disabled={busy === "save"} onClick={close}>Account details</button><button className={s.closeButton} disabled={busy === "save"} onClick={close} aria-label="Close share price view">×</button></div>
      <header className={s.heading}><div className={s.stockIdentity}><span className={s.companyMark} aria-hidden="true">{instrument.symbol.split(":")[1][0]}</span><div><p>{instrument.name.toUpperCase()}</p><h2 id="saved-stock-heading">{account.holdingName} <span>share price</span></h2></div></div><span className={s.ticker}>{instrument.symbol} · USD</span></header>
      <div className={s.layout}>
        <section className={s.market} aria-label="Market price history">
          <div className={s.marketHeading}><div><p className={s.eyebrow}>MARKET VIEW</p><h3>A view beyond the balance.</h3></div><span className={s.dataLabel}>Delayed market data</span></div>
          <div className={s.rangeRow}><div className={s.ranges} role="group" aria-label="Price history range">{chartRanges.map(item => <button key={item.id} aria-label={item.label} aria-pressed={range === item.id} onClick={() => { setRange(item.id); setFrameOpened(false); }}>{item.id}</button>)}</div><span>Share price in USD</span></div>
          <div className={s.chartViewport}>{loaded && descriptor ? <iframe key={descriptor.iframeUrl} src={descriptor.iframeUrl} className={s.chart} title={`${instrument.name} delayed share-price chart`} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" onLoad={() => setFrameOpened(true)} /> : <div className={s.consent}><h4>The chart is hidden.</h4><p>Explore {instrument.name}’s price history on TradingView.</p><button className={s.loadButton} onClick={() => setLoaded(true)}>Show TradingView chart ↗</button></div>}</div>
          <div className={s.providerRow}><span>Chart by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></span>{loaded ? <button className={s.hideButton} onClick={() => { setLoaded(false); setFrameOpened(false); }}>Hide chart</button> : null}</div>
          {loaded ? <p role="status" className={s.frameStatus}>{frameOpened ? "Chart frame opened. Prices and availability are supplied by TradingView." : "Opening the TradingView chart frame…"}</p> : null}
          <p className={s.marketNote}>US prices may be delayed or supplied by Cboe and can differ from your broker. Chart prices are not imported automatically.</p><p className={s.marketNote}>TradingView receives your IP and the public ticker. Your account figures are not sent. You can hide the chart at any time.</p>
          {descriptor ? <a className={s.fallback} href={descriptor.externalUrl} target="_blank" rel="noopener noreferrer">Open chart on TradingView ↗</a> : null}
        </section>
        <aside className={s.recorded} aria-labelledby="saved-holding-heading"><p className={s.eyebrow}>YOUR HOLDING · GBP</p><h3 id="saved-holding-heading">Your investment</h3>
          <div className={s.recordedValue}><span>{account.marketValuation ? "Estimated market value" : "Recorded holding value"}</span><strong>{M.gbp(account.balance)}</strong><small>{account.marketValuation ? `Price applied ${new Date(account.marketValuation.appliedAt).toLocaleDateString("en-GB")}` : "Your saved provider balance"}</small></div>
          <form className={s.priceForm} onSubmit={apply} noValidate><label htmlFor={priceId}>Current price per share (USD)</label><input id={priceId} disabled={!!busy || !account.investment} inputMode="decimal" maxLength={30} value={price} placeholder="e.g. 60.00" onChange={event => { setPrice(event.target.value); setError(""); }} /><p>Enter your provider’s price. A dated exchange rate estimates the GBP value.</p><button className={s.applyPrice} disabled={!!busy || !account.investment}>{busy === "rate" ? "Getting daily rate…" : busy === "save" ? "Saving value…" : "Update holding value"}</button></form>
          {error ? <p role="alert" className={s.valueError}>{error}</p> : null}{message ? <output className={s.frameStatus}>{message}</output> : null}
          {account.marketValuation ? <div className={s.valuationBreakdown} aria-label="Holding performance"><p>Frankfurter · Rate dated {account.marketValuation.fxDate}</p>{result ? <p><b>Capital return</b><strong data-negative={result.amount < 0}>{M.gbp(result.amount)}{result.percent !== null ? ` (${result.percent.toFixed(2)}%)` : ""}</strong></p> : null}<button className={s.hideButton} disabled={!!busy} onClick={restoreRecorded}>Use recorded value</button></div> : null}
          <dl className={s.holdingStats}><div><dt>Shares</dt><dd>{account.investment ? formatShares(account.investment.shares) : "—"}</dd></div><div><dt>Average purchase price</dt><dd>{account.investment ? averagePriceLabel(account.investment) : "—"}</dd></div><div><dt>Recorded dividend yield</dt><dd>{account.ratePct}%</dd></div><div><dt>Estimated annual income</dt><dd>{M.gbp(M.accountMonthlyIncome(account) *12)}</dd></div></dl>
          <p className={s.currencyNote}>Your recorded {M.gbp(original)} balance remains available. Market-value changes keep your purchase cost and recorded dividend assumptions separate.</p><button className={s.hideButton} disabled={!!busy} onClick={onEdit}>{account.investment ? "Edit holding details" : "Add share details"}</button>
        </aside>
      </div>
    </dialog>
  </>;
}
