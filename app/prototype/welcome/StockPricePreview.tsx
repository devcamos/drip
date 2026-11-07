"use client";

import { useEffect, useRef, useState } from "react";
import { chartRanges, stockChartDescriptor, stockInstrument, type StockInstrument } from "./stock-chart";
import type { ChartRange } from "./stock-chart";
import StockValuePreview from "./StockValuePreview";
import type { StockHoldingStats, StockPriceInput } from "./stock-valuation";
import s from "./stock-price.module.css";

export default function StockPricePreview({ onClose, priceInput, onPriceChange, instrumentId = "realty-income", holding }: { onClose: () => void; priceInput: StockPriceInput | null; onPriceChange: (input: StockPriceInput | null) => void; instrumentId?: StockInstrument["id"]; holding?: StockHoldingStats }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const loadTrigger = useRef<HTMLButtonElement>(null);
  const [range, setRange] = useState<ChartRange>("1M");
  const [loaded, setLoaded] = useState(true);
  const [frameOpened, setFrameOpened] = useState(false);
  const instrument = stockInstrument(instrumentId)!;
  const descriptor = stockChartDescriptor(instrumentId, range);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  function selectRange(next: ChartRange) { if (next !== range) { setRange(next); setFrameOpened(false); } }
  function hideChart() { setLoaded(false); setFrameOpened(false); requestAnimationFrame(() => loadTrigger.current?.focus()); }
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="stock-detail-heading" onCancel={onClose}>
    <div className={s.topBar}><button className={s.backButton} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h13" /></svg>Back to accounts</button><span>STOCK DETAIL · PROTOTYPE</span><button className={s.closeButton} onClick={onClose} aria-label="Close share price view">×</button></div>
    <header className={s.heading}><div className={s.stockIdentity}><span className={s.companyMark} aria-hidden="true">{instrument.symbol.split(":")[1]}</span><div><p>{instrument.name.toUpperCase()}</p><h2 id="stock-detail-heading">{instrument.name} <span>share price</span></h2></div></div><span className={s.ticker}>{instrument.symbol} · USD</span></header>
    <div className={s.layout}>
      <section className={s.market} aria-label="Market price history">
        <div className={s.marketHeading}><div><p className={s.eyebrow}>MARKET VIEW</p><h3>A view beyond the balance.</h3></div><span className={s.dataLabel}>Delayed market data</span></div>
        <div className={s.rangeRow}><div className={s.ranges} role="group" aria-label="Price history range">{chartRanges.map(item => <button key={item.id} aria-label={item.label} aria-pressed={range === item.id} onClick={() => selectRange(item.id)}>{item.id}</button>)}</div><span>Share price in USD</span></div>
        <div className={s.chartViewport}>
          {loaded && descriptor ? <iframe key={descriptor.iframeUrl} src={descriptor.iframeUrl} className={s.chart} title={`${instrument.name} delayed share-price chart`} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" onLoad={() => setFrameOpened(true)} /> : <div className={s.consent}>
            <span className={s.chartIcon} aria-hidden="true"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="6" width="24" height="20" rx="4" /><path d="M4 12h24M9 9h1M13 9h1" /></svg></span>
            <h4>The chart is hidden.</h4><p>Show TradingView’s chart to explore {instrument.name}’s share-price history. US market data may be delayed or supplied by Cboe.</p><button ref={loadTrigger} className={s.loadButton} disabled={!descriptor} onClick={() => setLoaded(true)}>Show TradingView chart <span aria-hidden="true">↗</span></button>
          </div>}
        </div>
        <div className={s.providerRow}><span>Chart by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></span>{loaded ? <button className={s.hideButton} onClick={hideChart}>Hide chart</button> : null}</div>
        {loaded ? <p role="status" className={s.frameStatus}>{frameOpened ? "Chart frame opened. Prices and availability are supplied by TradingView." : "Opening the TradingView chart frame…"}</p> : null}
        <p className={s.marketNote}>The chart opens with this card. It can differ from Trading 212’s prices. Enter a current price to estimate your holding value.</p>
        <p className={s.marketNote}>TradingView receives your IP and the public ticker. Your holding figures aren’t sent. You can hide the chart at any time.</p>
        <p className={s.marketNote}>If the chart stays blank or this listing is unavailable, open it on TradingView.</p>
        {descriptor ? <a className={s.fallback} href={descriptor.externalUrl} target="_blank" rel="noopener noreferrer">Open chart on TradingView <span aria-hidden="true">↗</span></a> : <p className={s.marketNote}>A chart isn’t configured for this holding.</p>}
      </section>
      <StockValuePreview input={priceInput} onUse={onPriceChange} holding={holding} />
    </div>
  </dialog>;
}
