"use client";
import { useRef } from "react";
import type { Account } from "@/lib/types";
import { gbp } from "@/lib/maths";
import { accountTitle } from "./accounts/presentation";
import { analyticsDashboardModel } from "@/lib/analytics-dashboard";
import s from "./analytics-dashboard.module.css";

export function AnalyticsDashboard({ accounts, today, onOpen }: Readonly<{accounts:Account[];today:string;onOpen:(id:string)=>void}>) {
 const m=analyticsDashboardModel(accounts,today), track=useRef<HTMLDivElement>(null);
 const plays=Number(!!m.rateComparison)+Number(m.counts.dividends>0);
 return <section className={s.dashboard} aria-labelledby="analytics-title"><header><p className={s.kicker}>YOUR MONEY, IN PERSPECTIVE</p><h1 id="analytics-title">Financial overview</h1><p>Calculated on this device while Drip is unlocked.</p></header>
 <div className={s.grid} aria-label="Account summary">{([["Assets",m.totals.assets,m.counts.assets,"accounts"],["Debt",m.totals.debt,m.counts.debt,"credit cards"],["Dividend holdings",m.totals.dividends,m.counts.dividends,"holdings"],["ISAs",m.totals.isas,m.counts.isas,"accounts"]] as const).map(([label,value,count,unit])=><article key={label}><span>{label}</span><strong>{gbp(value)}</strong><small>{count} {unit}</small></article>)}</div>
 <section className={s.income} aria-label="Income"><div><p className={s.kicker}>INCOME</p><h2>{gbp(m.income.monthlyEstimate)} <small>estimated monthly average</small></h2><p>{gbp(m.income.annualEstimate)} estimated over the next 12 months</p></div><div><span>Received this month</span><strong>{gbp(m.income.receivedThisMonth)}</strong><small>Dividend payments logged: {gbp(m.income.dividendReceivedThisMonth)}</small></div><p className={s.note}>Forecasts use entered rates and balances; actual payments are logged separately. Estimates can change.</p></section>
 <section className={s.plays} aria-labelledby="plays-title"><div className={s.heading}><div><p className={s.kicker}>THINGS TO REVIEW</p><h2 id="plays-title">Potential life plays</h2></div>{plays>1&&<span>Swipe to explore · <button aria-label="Previous life play" onClick={()=>track.current?.scrollBy({left:-track.current.clientWidth,behavior:"smooth"})}>←</button> <button aria-label="Next life play" onClick={()=>track.current?.scrollBy({left:track.current.clientWidth,behavior:"smooth"})}>→</button></span>}</div>
 {plays?<div className={s.carousel} ref={track} role="region" aria-label="Potential life plays carousel" aria-roledescription="carousel" tabIndex={0}>
 {m.rateComparison&&<article role="group" aria-roledescription="slide" aria-label={`1 of ${plays}: Compare your rates`}><h3>Compare your rates</h3><p><b>{m.rateComparison.card.creditCard!.apr}% APR</b> on {accountTitle(m.rateComparison.card)} and <b>{m.rateComparison.saver.ratePct}% AER</b> on {accountTitle(m.rateComparison.saver)} have a stated-rate gap of {m.rateComparison.gap} percentage points.</p><p className={s.note}>APR and AER use different conventions. This is not an interest-cost comparison.</p><button onClick={()=>onOpen(m.rateComparison!.card.id)}>Review card</button> <button onClick={()=>onOpen(m.rateComparison!.saver.id)}>Review saver</button></article>}
 {m.counts.dividends>0&&<article role="group" aria-roledescription="slide" aria-label={`${m.rateComparison?2:1} of ${plays}: Review dividend income`}><h3>Review dividend income</h3><p>{m.counts.dividends} dividend {m.counts.dividends===1?"holding is":"holdings are"} included in your estimate. You logged {gbp(m.income.dividendReceivedThisMonth)} this month.</p><p className={s.note}>Prices and future payouts can change. Drip does not infer ISA allowance or investment suitability.</p></article>}
 </div>:<p>Add a savings rate or dividend holding to see observations.</p>}</section>
 <p className={s.privacy}><b>Privacy</b> Totals are derived on this device from your unlocked account data. They are not sent to analytics. Any cloud copy remains encrypted.</p>
 {m.counts.isas>0&&<p className={s.note}>ISA accounts can also be dividend holdings; category totals overlap and are not additive.</p>}
 </section>;
}
