"use client";

import { useEffect, useRef, useState } from "react";
import { chartRanges, stockChartDescriptor, stockInstrument } from "./stock-chart";
import type { ChartRange } from "./stock-chart";
import s from "./stock-price.module.css";

export default function StockPricePreview({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const loadTrigger = useRef<HTMLButtonElement>(null);
  const [range, setRange] = useState<ChartRange>("1M");
  const [loaded, setLoaded] = useState(false);
  const [frameOpened, setFrameOpened] = useState(false);
  const instrument = stockInstrument("realty-income");
  const descriptor = stockChartDescriptor("realty-income", range);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  function selectRange(next: ChartRange) { if (next !== range) { setRange(next); setFrameOpened(false); } }
  function hideChart() { setLoaded(false); setFrameOpened(false); requestAnimationFrame(() => loadTrigger.current?.focus()); }
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="stock-detail-heading" onCancel={onClose}>
    <div className={s.topBar}><button className={s.backButton} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h13" /></svg>Back to accounts</button><span>STOCK DETAIL · PROTOTYPE</span><button className={s.closeButton} onClick={onClose} aria-label="Close share price view">×</button></div>
    <header className={s.heading}><div className={s.stockIdentity}><span className={s.companyMark} aria-hidden="true">O</span><div><p>REALTY INCOME CORPORATION</p><h2 id="stock-detail-heading">Realty Income <span>share price</span></h2></div></div><span className={s.ticker}>{instrument?.symbol ?? "NYSE:O"} · USD</span></header>
    <div className={s.layout}>
      <section className={s.market} aria-label="Market price history">
        <div className={s.marketHeading}><div><p className={s.eyebrow}>MARKET VIEW</p><h3>A view beyond the balance.</h3></div><span className={s.dataLabel}>Delayed market data</span></div>
        <div className={s.rangeRow}><div className={s.ranges} role="group" aria-label="Price history range">{chartRanges.map(item => <button key={item.id} aria-label={item.label} aria-pressed={range === item.id} onClick={() => selectRange(item.id)}>{item.id}</button>)}</div><span>Share price in USD</span></div>
        <div className={s.chartViewport}>
          {loaded && descriptor ? <iframe key={descriptor.iframeUrl} src={descriptor.iframeUrl} className={s.chart} title="Realty Income delayed share-price chart" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" onLoad={() => setFrameOpened(true)} /> : <div className={s.consent}>
            <span className={s.chartIcon} aria-hidden="true"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="6" width="24" height="20" rx="4" /><path d="M4 12h24M9 9h1M13 9h1" /></svg></span>
            <h4>A separate window on the market.</h4><p>Load TradingView’s chart to explore Realty Income’s share-price history. US market data may be delayed or supplied by Cboe.</p><button ref={loadTrigger} className={s.loadButton} disabled={!descriptor} onClick={() => setLoaded(true)}>Load TradingView chart <span aria-hidden="true">↗</span></button><small>TradingView receives your IP, the public ticker and this page’s address. Your Drip holding figures aren’t sent.</small>
          </div>}
        </div>
        <div className={s.providerRow}><span>Chart by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></span>{loaded ? <button className={s.hideButton} onClick={hideChart}>Hide chart</button> : null}</div>
        {loaded ? <p role="status" className={s.frameStatus}>{frameOpened ? "Chart frame opened. Prices and availability are supplied by TradingView." : "Opening the TradingView chart frame…"}</p> : null}
        <p className={s.marketNote}>The chart is a market reference. It can differ from Trading 212’s prices and doesn’t update your recorded holding value.</p>
        <p className={s.marketNote}>If the chart stays blank or this listing is unavailable, open it on TradingView.</p>
        {descriptor ? <a className={s.fallback} href={descriptor.externalUrl} target="_blank" rel="noopener noreferrer">Open chart on TradingView <span aria-hidden="true">↗</span></a> : <p className={s.marketNote}>A chart isn’t configured for this holding.</p>}
      </section>
      <aside className={s.recorded} aria-labelledby="recorded-holding-heading">
        <p className={s.eyebrow}>YOUR FIGURES · GBP</p><h3 id="recorded-holding-heading">Your recorded holding</h3><p className={s.recordedIntro}>The figures you enter in Drip stay separate from the market chart.</p>
        <div className={s.recordedValue}><span>Holding value</span><strong>£2,500.00</strong><small>Recorded value · Prices are not live</small></div>
        <dl className={s.holdingStats}><div><dt>Shares</dt><dd>50</dd></div><div><dt>Average purchase price</dt><dd>£48.00</dd></div><div><dt>Dividend yield</dt><dd>5.40%</dd></div><div><dt>Estimated annual income</dt><dd>£135.00</dd></div></dl>
        <p className={s.currencyNote}><b>Two currencies, two different views.</b>The chart shows a share price in USD. Your holding value and average purchase price above are recorded in GBP; no currency conversion or market valuation is applied here.</p>
      </aside>
    </div>
  </dialog>;
}
