"use client";

import { useRef, useState } from "react";
import { CreditCardPaymentSummary, CreditCardPreview, formatGBP } from "./CreditCardPreview";
import { creditOverview } from "./credit-card";
import type { CreditCard } from "./credit-card";
import StockPricePreview from "./StockPricePreview";
import { estimateStockValue, type StockPriceInput } from "./stock-valuation";
import stockStyle from "./stock-price.module.css";
import s from "./welcome.module.css";

export type ExampleAccount = "cash" | "stock" | "credit";
const samples = [
  { id: "cash" as const, name: "Zopa", detail: "Easy-access saver", provider: "Cash savings", value: "£5,000.00", rate: "4.10%", yearly: "£205.00", monthly: "£17.08", date: "16 Nov", short: "Z", className: s.purple },
  { id: "stock" as const, name: "Realty Income", detail: "Trading 212 · Dividends", provider: "Stocks & funds", value: "£2,500.00", rate: "5.40%", yearly: "£135.00", monthly: "£11.25", date: "15 Nov", short: "O", className: s.green },
];

export function AccountPreview({ selected, onSelect, onAdd, creditCard, onCreditChange, stockPrice, onStockPrice, stockOpen, onStockOpen }: { selected: ExampleAccount | null; onSelect: (id: ExampleAccount | null) => void; onAdd: () => void; creditCard: CreditCard; onCreditChange: (card: CreditCard) => void; stockPrice: StockPriceInput | null; onStockPrice: (input: StockPriceInput | null) => void; stockOpen: boolean; onStockOpen: (open: boolean) => void }) {
  const [incomePeriod, setIncomePeriod] = useState<"month" | "year">("month");
  const stockTrigger = useRef<HTMLButtonElement>(null);
  const valuation = estimateStockValue(stockPrice);
  const overview = creditOverview(5000 + (valuation?.valueGBP ?? 2500), creditCard);
  function selectAccount(id: ExampleAccount) { const opening = selected !== id; onSelect(opening ? id : null); if (id === "stock" && opening) onStockOpen(true); }
  function closeStock() { onStockOpen(false); requestAnimationFrame(() => stockTrigger.current?.focus()); }
  return <section aria-label="Example accounts design">
    <header className={s.accountsHeading}><div><p className={s.eyebrow}>HELLO, DEMO_GROWER</p><h1>A little more <em>perspective.</em></h1></div><span className={s.samplePill}>Sample accounts · GBP</span></header>
    <div className={s.overview}><section className={s.balanceHero} aria-label="Money overview"><div className={s.heroTop}><span>Money</span><span className={s.heroMark} aria-hidden="true">↗</span></div><p>{formatGBP(overview.money)}</p><dl className={s.financialBreakdown}><div><dt>Credit card debt</dt><dd>{formatGBP(overview.debt)}</dd></div><div><dt>Net position</dt><dd>{formatGBP(overview.netPosition)}</dd></div></dl><small className={s.netNote}>Net position is money minus recorded credit card debt.</small><div className={s.balanceFoot}><span><i />2 asset accounts + 1 credit card</span><span>{valuation ? "Includes a market estimate" : "Recorded values"}</span></div></section><section className={s.incomeHero} aria-label="Estimated income"><p className={s.eyebrow}>YOUR INCOME OUTLOOK</p><h2>{incomePeriod === "month" ? "£28.33" : "£340.00"}<span> / {incomePeriod === "month" ? "month" : "year"}</span></h2><p>{incomePeriod === "month" ? "Estimated monthly average" : "Estimated annual income"}</p><div className={s.periodPicker} role="group" aria-label="Estimate period"><button aria-pressed={incomePeriod === "month"} onClick={() => setIncomePeriod("month")}>Monthly</button><button aria-pressed={incomePeriod === "year"} onClick={() => setIncomePeriod("year")}>Yearly</button></div><small>Savings and investment income only. Annual estimates ÷ 12 for the monthly average; payment amounts and dates can vary.</small></section></div>
    <div className={s.accountsLayout}><section className={s.wallet} aria-labelledby="stack-title"><div className={s.sectionHeading}><h2 id="stack-title">Your accounts <span>03</span></h2><button className={s.addSmall} onClick={onAdd} aria-label="Add an example account">+</button></div><p className={s.sectionIntro}>Tap a card. Money and debt stay clearly labelled.</p><div className={s.cardStack}>
      {samples.map(account => <article key={account.id} className={`${s.accountCard} ${account.className} ${selected === account.id ? s.cardOpen : ""}`}>
        <button ref={account.id === "stock" ? stockTrigger : undefined} className={s.cardTrigger} aria-expanded={selected === account.id} aria-controls={`example-${account.id}`} aria-haspopup={account.id === "stock" ? "dialog" : undefined} onClick={() => selectAccount(account.id)}><span className={s.providerLogo}>{account.short}</span><span className={s.cardTitle}>{account.name}<small>{account.detail}</small></span><span className={s.cardValue}>{account.id === "stock" && valuation ? formatGBP(valuation.valueGBP) : account.value}<small>{account.id === "stock" && valuation ? "Estimated market value" : selected === account.id ? "Close details −" : "View account +"}</small></span></button>
        <div className={s.cardDetails} id={`example-${account.id}`} hidden={selected !== account.id}><dl><div><dt>{account.id === "cash" ? "Annual interest rate" : "Recorded dividend yield"}</dt><dd>{account.rate}</dd></div><div><dt>Estimated annual income</dt><dd>{account.yearly}</dd></div>{account.id === "stock" ? <><div><dt>Shares</dt><dd>50</dd></div><div><dt>Average price</dt><dd>£48.00</dd></div></> : null}<div><dt>Next expected payment</dt><dd>{account.date}</dd></div><div><dt>Estimated payment</dt><dd>{account.monthly}</dd></div></dl><p>{account.id === "cash" ? "Balance and rate entered from your provider." : valuation ? "Estimated value from your entered USD price and dated FX. Dividend income is unchanged." : "Recorded value and dividend yield entered from your provider. No current price applied."}</p>{account.id === "stock" ? <button className={stockStyle.explore} onClick={() => onStockOpen(true)}>Explore share price <span aria-hidden="true">↗</span></button> : null}</div>
      </article>)}
      <CreditCardPreview card={creditCard} open={selected === "credit"} onToggle={() => onSelect(selected === "credit" ? null : "credit")} onChange={onCreditChange} />
    </div><p className={s.walletFoot}>Your balances. Your colours. Your corner of finance.</p></section>
    <aside className={s.accountAside}><CreditCardPaymentSummary card={creditCard} /><section className={s.nextPayment} aria-label="Next expected payment"><div className={s.sectionHeading}><h2>Next little drop</h2><span className={s.tinyEyebrow}>EXPECTED</span></div><div className={s.paymentRow}><span className={s.calendarDate}>NOV<b>15</b></span><div><b>Realty Income</b><small>Estimated dividend</small></div><strong>£11.25</strong></div><p>Based on the next payment date you record. It isn’t a confirmed payment.</p></section><section className={s.received} aria-label="Received income"><div><span className={s.eyebrow}>RECEIVED THIS MONTH</span><strong>£0.00</strong></div><span className={s.receivedIcon} aria-hidden="true">↓</span><p>No payments logged yet. Received income stays separate from your estimates.</p></section></aside></div>
    {stockOpen ? <StockPricePreview onClose={closeStock} priceInput={stockPrice} onPriceChange={onStockPrice} /> : null}
  </section>;
}
