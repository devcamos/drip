"use client";

import { useRef } from "react";
import { CreditCardPaymentSummary, CreditCardPreview, formatGBP } from "./CreditCardPreview";
import type { CreditCard } from "./credit-card";
import { portfolioSummary, type DemoAccount, type DemoCredit, type IncomePeriod } from "./demo-accounts";
import StockPricePreview from "./StockPricePreview";
import { stockInstrument } from "./stock-chart";
import { estimateStockValue, type StockPriceInput } from "./stock-valuation";
import stockStyle from "./stock-price.module.css";
import s from "./welcome.module.css";

type Props = {
  accounts: DemoAccount[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onCreditChange: (id: string, card: CreditCard) => void;
  onStockPrice: (id: string, input: StockPriceInput | null) => void;
  stockOpen: boolean;
  onStockOpen: (open: boolean) => void;
  incomePeriod: IncomePeriod;
  onIncomePeriod: (period: IncomePeriod) => void;
};

export function AccountPreview({ accounts, selected, onSelect, onAdd, onCreditChange, onStockPrice, stockOpen, onStockOpen, incomePeriod, onIncomePeriod }: Props) {
  const stockTriggers = useRef(new Map<string, HTMLButtonElement>());
  const overview = portfolioSummary(accounts);
  const creditCards = accounts.filter((account): account is DemoCredit => account.kind === "credit");
  const active = accounts.find(account => account.id === selected);
  function selectAccount(account: DemoAccount) {
    const opening = selected !== account.id;
    onSelect(opening ? account.id : null);
    if (account.kind === "stock" && opening) onStockOpen(true);
  }
  function closeStock() { onStockOpen(false); if (selected) requestAnimationFrame(() => stockTriggers.current.get(selected)?.focus()); }
  return <section aria-label="Example accounts design">
    <header className={s.accountsHeading}><div><p className={s.eyebrow}>HELLO, DEMO_GROWER</p><h1>A little more <em>perspective.</em></h1></div><span className={s.samplePill}>Sample accounts · GBP</span></header>
    <div className={s.overview}>
      <section className={s.balanceHero} aria-label="Money overview"><div className={s.heroTop}><span>Money</span><span className={s.heroMark} aria-hidden="true">↗</span></div><p>{formatGBP(overview.money)}</p><dl className={s.financialBreakdown}><div><dt>Credit card debt</dt><dd>{formatGBP(overview.debt)}</dd></div><div><dt>Net position</dt><dd>{formatGBP(overview.netPosition)}</dd></div></dl><small className={s.netNote}>Your assets and credit card debt in one view.</small><div className={s.balanceFoot}><span><i />{overview.cash + overview.stocks} asset accounts + {overview.credits} credit {overview.credits === 1 ? "card" : "cards"}</span><span>{overview.estimated ? "Includes a market estimate" : "Recorded values"}</span></div></section>
      <section className={s.incomeHero} aria-label="Estimated income"><p className={s.eyebrow}>YOUR INCOME OUTLOOK</p><h2>{formatGBP(incomePeriod === "month" ? overview.monthlyIncome : overview.annualIncome)}<span> / {incomePeriod === "month" ? "month" : "year"}</span></h2><p>{incomePeriod === "month" ? "Estimated monthly average" : "Estimated annual income"}</p><div className={s.periodPicker} role="group" aria-label="Estimate period"><button aria-pressed={incomePeriod === "month"} onClick={() => onIncomePeriod("month")}>Monthly</button><button aria-pressed={incomePeriod === "year"} onClick={() => onIncomePeriod("year")}>Yearly</button></div><small>Savings and investment income estimates. Payment amounts and dates can vary.</small></section>
    </div>
    <div className={s.accountsLayout}>
      <section className={s.wallet} aria-labelledby="stack-title"><div className={s.sectionHeading}><h2 id="stack-title">Your accounts <span>{String(accounts.length).padStart(2, "0")}</span></h2><button className={s.addSmall} onClick={onAdd} aria-label="Add an example account">+</button></div><p className={s.sectionIntro}>Tap a card. Add another holding or credit card whenever you need.</p><div className={s.cardStack}>
        {accounts.map(account => {
          if (account.kind === "credit") return <CreditCardPreview key={account.id} id={account.id} name={account.name} card={account.card} open={selected === account.id} onToggle={() => selectAccount(account)} onChange={card => onCreditChange(account.id, card)} />;
          const stock = account.kind === "stock";
          const valuation = stock ? estimateStockValue(account.price, account.holding) : null;
          const value = stock ? valuation?.valueGBP ?? account.holding.recordedValueGBP : account.balance;
          const annual = stock ? account.holding.annualIncomeGBP : account.balance * account.ratePct / 100;
          return <article key={account.id} className={`${s.accountCard} ${stock ? s.green : s.purple} ${selected === account.id ? s.cardOpen : ""}`}>
            <button ref={node => { if (node) stockTriggers.current.set(account.id, node); else stockTriggers.current.delete(account.id); }} className={s.cardTrigger} aria-expanded={selected === account.id} aria-controls={`example-${account.id}`} aria-haspopup={stock ? "dialog" : undefined} onClick={() => selectAccount(account)}><span className={s.providerLogo}>{stock ? stockInstrument(account.instrumentId)?.symbol.split(":")[1] : account.name[0]}</span><span className={s.cardTitle}>{account.name}<small>{stock ? "Trading 212 · Dividends" : "Easy-access saver"}</small></span><span className={s.cardValue}>{formatGBP(value)}<small>{valuation ? "Estimated market value" : selected === account.id ? "Close details −" : "View account +"}</small></span></button>
            <div className={s.cardDetails} id={`example-${account.id}`} hidden={selected !== account.id}>
              <dl><div><dt>{stock ? "Recorded dividend yield" : "Annual interest rate"}</dt><dd>{(stock ? account.holding.yieldPct : account.ratePct).toFixed(2)}%</dd></div><div><dt>Estimated annual income</dt><dd>{formatGBP(annual)}</dd></div>{stock ? <><div><dt>Shares</dt><dd>{account.holding.shares}</dd></div><div><dt>Average price</dt><dd>{formatGBP(account.holding.averagePriceGBP)}</dd></div></> : null}<div><dt>Next expected payment</dt><dd>{stock ? "15 Nov" : "16 Nov"}</dd></div><div><dt>Estimated payment</dt><dd>{formatGBP(annual / 12)}</dd></div></dl>
              <p>{!stock ? "Balance and rate entered from your provider." : valuation ? "Estimated value from your entered USD price and dated FX. Dividend income is unchanged." : "Recorded value and dividend yield entered from your provider. No current price applied."}</p>{stock ? <button className={stockStyle.explore} onClick={() => onStockOpen(true)}>Explore share price <span aria-hidden="true">↗</span></button> : null}
            </div>
          </article>;
        })}
      </div><p className={s.walletFoot}>Your balances. Your colours. Your corner of finance.</p></section>
      <aside className={s.accountAside}>
        {creditCards.map(account => <CreditCardPaymentSummary key={account.id} card={account.card} name={account.name} label={creditCards.length === 1 ? "Credit card payment plan" : `${account.name} payment plan`} />)}
        <section className={s.nextPayment} aria-label="Next expected payment"><div className={s.sectionHeading}><h2>Next little drop</h2><span className={s.tinyEyebrow}>EXPECTED</span></div><div className={s.paymentRow}><span className={s.calendarDate}>NOV<b>15</b></span><div><b>Realty Income</b><small>Estimated dividend</small></div><strong>£11.25</strong></div><p>Based on the next payment date you record. It isn’t a confirmed payment.</p></section><section className={s.received} aria-label="Received income"><div><span className={s.eyebrow}>RECEIVED THIS MONTH</span><strong>£0.00</strong></div><span className={s.receivedIcon} aria-hidden="true">↓</span><p>No payments logged yet. Received income stays separate from your estimates.</p></section>
      </aside>
    </div>
    {stockOpen && active?.kind === "stock" ? <StockPricePreview key={active.id} instrumentId={active.instrumentId} holding={active.holding} onClose={closeStock} priceInput={active.price} onPriceChange={price => onStockPrice(active.id, price)} /> : null}
  </section>;
}
