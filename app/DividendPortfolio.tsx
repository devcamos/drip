"use client";
import { useState } from "react";
import type { Account } from "@/lib/types";
import { dividendIncome, dividendPortfolio, type IncomePeriod } from "@/lib/dividend-portfolio";
import { gbp, monthlyIncome } from "@/lib/maths";
import { displayProvider } from "@/lib/products";
import { useCalendarDay } from "./useCalendarDay";
import { averagePriceLabel, formatShares } from "@/lib/stock-investment";

export function DividendPortfolio({ accounts, onOpen, onAdd }: Readonly<{ accounts: Account[]; onOpen: (id: string) => void; onAdd: () => void }>) {
  const day = useCalendarDay();
  const portfolio = dividendPortfolio(accounts, day);
  const [period, setPeriod] = useState<IncomePeriod>("all");
  const periodName = { month: "This month", year: "This year", all: "All time" }[period];
  const maximum = Math.max(1, ...portfolio.history.map(month => month.income));
  return <>
    <div className="section-heading"><p className="section-eyebrow">YOUR INVESTMENTS</p><h1>Dividend portfolio</h1><p className="muted">See what your holdings have paid, and what they could earn.</p></div>
    {!portfolio.holdings.length ? <section className="panel portfolio-empty"><h2>No dividend holdings yet</h2><p className="muted">Add stocks or funds with a dividend yield to start your portfolio. Cash interest stays in Accounts.</p><button className="btn" onClick={onAdd}>Add dividend holding</button></section> : <>
      <section className="panel dividend-hero" aria-label="Dividend income total"><p className="muted">Dividends received · {periodName.toLowerCase()}</p><div className="big" data-testid="dividend-income-total">{gbp(dividendIncome(portfolio.holdings, day, period))}</div>
        <fieldset className="income-periods"><legend className="sr-only">Income period</legend>{(["month", "year", "all"] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{({ month: "This month", year: "This year", all: "All time" })[value]}</button>)}</fieldset>
        <p className="muted">Payments you have logged for your current dividend holdings. Interest, bonuses, top-ups and unreceived estimates are excluded.</p>
      </section>
      <section className="grid" aria-label="Dividend portfolio figures">
        <div className="stat"><div className="muted">Portfolio value</div><div className="v">{gbp(portfolio.value)}</div></div>
        <div className="stat"><div className="muted">Average yield</div><div className="v">{portfolio.yieldPct.toFixed(2)}%</div></div>
        <div className="stat"><div className="muted">Estimated monthly</div><div className="v">{gbp(portfolio.monthlyEstimate)}</div></div>
        <div className="stat"><div className="muted">Estimated yearly</div><div className="v">{gbp(portfolio.annualEstimate)}</div></div>
      </section>
      <p className="muted">Estimates use your saved values and annual yields. Monthly estimates are yearly income ÷ 12; your actual payment schedule may differ.</p>
      <section className="panel" aria-labelledby="dividend-history-title"><h2 id="dividend-history-title">Income over six months</h2>
        {portfolio.history.some(month => month.income > 0) ? <ol className="dividend-history">{portfolio.history.map(month => <li key={month.month}><span>{new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}</span><span className="dividend-bar" aria-hidden="true"><i style={{ width: `${month.income / maximum * 100}%` }} /></span><b>{gbp(month.income)}</b></li>)}</ol> : <p className="muted">Log a dividend payment from a holding to start your income history.</p>}
      </section>
      <section aria-labelledby="dividend-holdings-title"><div className="wallet-heading"><h2 id="dividend-holdings-title">Your dividend holdings</h2><button className="btn ghost small" onClick={onAdd}>Add holding</button></div>
        <ul className="portfolio-holdings">{portfolio.holdings.map(holding => <li key={holding.id}><button onClick={() => onOpen(holding.id)} aria-label={`Open ${holding.holdingName ?? displayProvider(holding.provider)}`}><span><b>{holding.holdingName ?? displayProvider(holding.provider)}</b><small>{holding.holdingName ? displayProvider(holding.provider) : "Dividend account"}</small></span><strong>{gbp(holding.balance)}</strong>{holding.investment && <small className="portfolio-position">{formatShares(holding.investment.shares)} shares · Average {averagePriceLabel(holding.investment)} · {holding.ratePct}% yield</small>}<span className="holding-income">Received · {periodName.toLowerCase()} <b>{gbp(dividendIncome([holding], day, period))}</b></span><span className="holding-income">Estimated monthly <b>{gbp(monthlyIncome(holding.balance, holding.ratePct))}</b></span></button></li>)}</ul>
      </section>
    </>}
  </>;
}
