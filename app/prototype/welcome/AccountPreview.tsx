"use client";

import { useState } from "react";
import { Arrow } from "./WelcomePanels";
import s from "./welcome.module.css";

export type ExampleAccount = "cash" | "stock";
const samples = [
  { id: "cash" as const, name: "Zopa", detail: "Easy-access saver", provider: "Cash savings", value: "£5,000.00", rate: "4.10%", yearly: "£205.00", monthly: "£17.08", date: "16 Nov", short: "Z", className: s.purple },
  { id: "stock" as const, name: "Realty Income", detail: "Trading 212 · Dividends", provider: "Stocks & funds", value: "£2,500.00", rate: "5.40%", yearly: "£135.00", monthly: "£11.25", date: "15 Nov", short: "O", className: s.green },
];

export function AccountPreview({ selected, onSelect, onAdd }: { selected: ExampleAccount | null; onSelect: (id: ExampleAccount | null) => void; onAdd: () => void }) {
  const [incomePeriod, setIncomePeriod] = useState<"month" | "year">("month");
  return <section aria-label="Example accounts design">
    <header className={s.accountsHeading}><div><p className={s.eyebrow}>HELLO, DEMO_GROWER</p><h1>A little more <em>perspective.</em></h1></div><span className={s.samplePill}>Sample accounts · GBP</span></header>
    <div className={s.overview}><section className={s.balanceHero} aria-label="Total balance"><div className={s.heroTop}><span>Total balance</span><span className={s.heroMark} aria-hidden="true">↗</span></div><p>£7,500<span>.00</span></p><div className={s.balanceFoot}><span><i />2 accounts, one clear picture</span><span>Recorded values</span></div></section><section className={s.incomeHero} aria-label="Estimated income"><p className={s.eyebrow}>YOUR INCOME OUTLOOK</p><h2>{incomePeriod === "month" ? "£28.33" : "£340.00"}<span> / {incomePeriod === "month" ? "month" : "year"}</span></h2><p>{incomePeriod === "month" ? "Estimated monthly average" : "Estimated annual income"}</p><div className={s.periodPicker} role="group" aria-label="Estimate period"><button aria-pressed={incomePeriod === "month"} onClick={() => setIncomePeriod("month")}>Monthly</button><button aria-pressed={incomePeriod === "year"} onClick={() => setIncomePeriod("year")}>Yearly</button></div><small>Annual estimates ÷ 12 for the monthly average. Payment amounts and dates can vary.</small></section></div>
    <div className={s.accountsLayout}><section className={s.wallet} aria-labelledby="stack-title"><div className={s.sectionHeading}><h2 id="stack-title">Your little earners <span>02</span></h2><button className={s.addSmall} onClick={onAdd} aria-label="Add an example account">+</button></div><p className={s.sectionIntro}>Tap a card. There’s more to the story.</p><div className={s.cardStack}>
      {samples.map(account => <article key={account.id} className={`${s.accountCard} ${account.className} ${selected === account.id ? s.cardOpen : ""}`}>
        <button className={s.cardTrigger} aria-expanded={selected === account.id} aria-controls={`example-${account.id}`} onClick={() => onSelect(selected === account.id ? null : account.id)}><span className={s.providerLogo}>{account.short}</span><span className={s.cardTitle}>{account.name}<small>{account.detail}</small></span><span className={s.cardValue}>{account.value}<small>{selected === account.id ? "Close details −" : "View account +"}</small></span></button>
        <div className={s.cardDetails} id={`example-${account.id}`} hidden={selected !== account.id}><dl><div><dt>{account.id === "cash" ? "Annual interest rate" : "Dividend yield"}</dt><dd>{account.rate}</dd></div><div><dt>Estimated annual income</dt><dd>{account.yearly}</dd></div>{account.id === "stock" ? <><div><dt>Shares</dt><dd>50</dd></div><div><dt>Average price</dt><dd>£48.00</dd></div></> : null}<div><dt>Next expected payment</dt><dd>{account.date}</dd></div><div><dt>Estimated payment</dt><dd>{account.monthly}</dd></div></dl><p>{account.id === "cash" ? "Balance and rate entered from your provider." : "Recorded value and dividend yield entered from your provider. Prices are not live."}</p></div>
      </article>)}
    </div><p className={s.walletFoot}>Your balances. Your colours. Your corner of finance.</p></section>
    <aside className={s.accountAside}><section className={s.nextPayment} aria-label="Next expected payment"><div className={s.sectionHeading}><h2>Next little drop</h2><span className={s.tinyEyebrow}>EXPECTED</span></div><div className={s.paymentRow}><span className={s.calendarDate}>NOV<b>15</b></span><div><b>Realty Income</b><small>Estimated dividend</small></div><strong>£11.25</strong></div><p>Based on the next payment date you record. It isn’t a confirmed payment.</p></section><section className={s.received} aria-label="Received income"><div><span className={s.eyebrow}>RECEIVED THIS MONTH</span><strong>£0.00</strong></div><span className={s.receivedIcon} aria-hidden="true">↓</span><p>No payments logged yet. Received income stays separate from your estimates.</p></section></aside></div>
  </section>;
}
