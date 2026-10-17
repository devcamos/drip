"use client";
import { useId, useState } from "react";
import type { AppData } from "@/lib/types";
import * as M from "@/lib/maths";
type Assumptions = { monthlyDeposit: number; years: number };
const ranges = ["3m", "6m", "1y", "Max", "Future"] as const;
type Range = typeof ranges[number];
const dateLabel = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const compactGBP = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 }).format(n);
export function Trends({ data, onAssumptions }: { data: AppData; onAssumptions: (value: Assumptions) => void }) {
  const [range, setRange] = useState<Range>("Future"); const [editing, setEditing] = useState(false);
  const assumptions = data.projection ?? { monthlyDeposit: 0, years: 1 };
  const [deposit, setDeposit] = useState(String(assumptions.monthlyDeposit)); const [years, setYears] = useState(assumptions.years);
  const fillId = useId();
  const today = M.ymd(new Date()); const currentMonth = today.slice(0, 7);
  const total = M.totalBalance(data.accounts); const monthlyRate = Math.max(0, M.weightedYield(data.accounts)) / 1200;
  const historical = data.snapshots.filter(s => s.month < currentMonth).toSorted((a, b) => a.month.localeCompare(b.month)).map(s => ({ date: M.ymd(new Date(Date.UTC(+s.month.slice(0, 4), +s.month.slice(5, 7), 0))), balance: s.totalBalance }));
  const since = M.addMonths(today, range === "3m" ? -3 : range === "6m" ? -6 : -12);
  const actual = [...historical.filter(p => range === "Future" || range === "Max" || p.date >= since), { date: today, balance: total }];
  const baseProjection = M.projection(data.accounts, assumptions.years * 12);
  const forecast = [{ date: today, balance: total }, ...baseProjection.map(p => ({ date: M.addMonths(today, p.month), balance: p.balance + assumptions.monthlyDeposit * (monthlyRate ? (Math.pow(1 + monthlyRate, p.month) - 1) / monthlyRate : p.month) }))];
  const future = range === "Future"; const final = forecast.at(-1)!;
  const start = actual[0].date === today ? M.addMonths(today, -1) : actual[0].date;
  const end = future ? final.date : today;
  const time = (d: string) => Date.parse(d + "T00:00:00Z");
  const x = (d: string) => 12 + (time(d) - time(start)) / Math.max(1, time(end) - time(start)) * 308;
  const maximum = Math.max(1, ...actual.map(p => p.balance), ...(future ? forecast.map(p => p.balance) : []));
  const scale = Math.pow(10, Math.floor(Math.log10(maximum))); const ceiling = Math.ceil(maximum / scale) * scale;
  const y = (value: number) => 190 - value / ceiling * 166;
  const path = (points: typeof actual) => points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const br = M.momBreakdown(data.snapshots); const growth = br ? br.growthPct : M.momGrowth(data.snapshots);
  const validDeposit = deposit.trim() !== "" && Number.isFinite(Number(deposit)) && Number(deposit) >= 0 && Number(deposit) <= 1_000_000;
  return <>
    <h1>Trends</h1>
    <p className="muted">{future ? `Estimated balance in ${assumptions.years === 1 ? "1 year" : `${assumptions.years} years`}` : "Your balance today"}</p>
    <div className="big">{M.gbp(future ? final.balance : total)}</div>
    <p className="muted">{future ? `${M.gbp(total)} today · ${M.gbp(assumptions.monthlyDeposit)} planned monthly top-up` : "Based on recorded monthly balances"}</p>
    <section className="panel trend-panel" aria-label="Balance chart">
      <svg className="trend-chart" viewBox="0 0 400 235" role="img" aria-label={`Recorded balance ${M.gbp(total)} today.${future ? ` Estimated ${M.gbp(final.balance)} by ${dateLabel(final.date)}. Dashed lines show estimates.` : " Solid line shows recorded monthly balances."}`}>
        <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--accent)" stopOpacity=".24" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {[0, ceiling / 2, ceiling].map(value => <g key={value}><line x1="12" x2="320" y1={y(value)} y2={y(value)} stroke="var(--border)" strokeDasharray="3 5" /><text x="332" y={y(value) + 4} className="chart-label">{compactGBP(value)}</text></g>)}
        {future && <><path d={`${path(forecast)} L${x(end)},190 L${x(today)},190 Z`} fill={`url(#${fillId})`} /><path d={path(forecast)} className="chart-projection" /><path d={`M${x(today)},${y(total)} L${x(end)},${y(total + assumptions.monthlyDeposit * assumptions.years * 12)}`} className="chart-baseline" /></>}
        <path d={path(actual)} className="chart-actual" />
        <line x1={x(today)} x2={x(today)} y1="15" y2="190" stroke="var(--text)" strokeWidth="1.5" />
        <circle cx={x(today)} cy={y(total)} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="3" />
        {actual.length > 1 && <text x="12" y="219" className="chart-label">{dateLabel(start)}</text>}
        <text x={x(today)} y="234" textAnchor={future ? "middle" : "end"} className="chart-label">Today</text>
        {future && <text x="320" y="219" textAnchor="end" className="chart-label">{dateLabel(end)}</text>}
      </svg>
      <div className="range-picker" role="group" aria-label="Chart period">{ranges.map(value => <button key={value} aria-pressed={range === value} className={range === value ? "selected" : ""} onClick={() => setRange(value)}>{value}</button>)}</div>
      <div className="chart-legend"><span><i className="legend-actual" />Recorded balance</span>{future && <><span><i className="legend-projection" />Estimated balance</span><span><i className="legend-baseline" />Today’s balance + planned top-ups</span></>}</div>
      {actual.length < 2 && <p className="muted">Your history starts today. Recorded balances will build as you use Drip.</p>}
      {future && <>
        <p className="muted">Assumes current rates stay the same, interest is reinvested monthly, top-ups arrive at month end and no withdrawals. New top-ups use your current weighted rate. Estimates are before tax and fees; investment returns can fall.</p>
        <button className="btn ghost" aria-expanded={editing} onClick={() => setEditing(!editing)}>Edit projection</button>
        {editing && <form onSubmit={event => { event.preventDefault(); if (validDeposit) { onAssumptions({ monthlyDeposit: Number(deposit), years }); setEditing(false); } }}>
          <label htmlFor="projection-deposit">Planned monthly top-up (£)</label><input id="projection-deposit" type="number" min="0" max="1000000" step="0.01" value={deposit} onChange={e => setDeposit(e.target.value)} />
          <label htmlFor="projection-years">Project ahead</label><select id="projection-years" value={years} onChange={e => setYears(Number(e.target.value))}>{[1, 3, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? "year" : "years"}</option>)}</select>
          <div className="row-gap"><button className="btn" disabled={!validDeposit}>Save projection</button></div>
        </form>}
      </>}
      <details className="chart-table"><summary>View chart figures</summary><table><thead><tr><th>Date</th><th>Balance</th><th>Type</th></tr></thead><tbody>{actual.map(p => <tr key={p.date}><td>{p.date === today ? "Today" : dateLabel(p.date)}</td><td>{M.gbp(p.balance)}</td><td>Recorded</td></tr>)}{future && forecast.slice(1).map(p => <tr key={p.date}><td>{dateLabel(p.date)}</td><td>{M.gbp(p.balance)}</td><td>Estimate</td></tr>)}</tbody></table></details>
    </section>
    <div className="grid">
      <div className="stat"><div className="muted">Total balance</div><div className="v">{M.gbp(total)}</div></div>
      <div className="stat"><div className="muted">Monthly income</div><div className="v">{M.gbp(M.totalMonthlyIncome(data.accounts))}</div></div>
      <div className="stat"><div className="muted">Weighted yield</div><div className="v">{M.weightedYield(data.accounts).toFixed(2)}%</div></div>
      <div className="stat"><div className="muted">Growth excl. deposits/withdrawals</div><div className="v">{growth === null ? "—" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}</div></div>
    </div>
    {br && <div className="panel"><h2>This month vs last</h2><ul className="list"><li><span>Top-ups (your deposits)</span><b>{M.gbp(br.deposits)}</b></li><li><span>Withdrawals</span><b>{br.withdrawals ? "−" : ""}{M.gbp(br.withdrawals)}</b></li><li><span>Growth from interest and returns</span><b>{br.growth >= 0 ? "+" : ""}{M.gbp(br.growth)} ({br.growthPct.toFixed(2)}%)</b></li><li><span>Total change</span><b>{M.gbp(br.change)}</b></li></ul></div>}
    {growth === null && <p className="muted">Month-on-month growth appears after Drip has two months of history.</p>}
  </>;
}
