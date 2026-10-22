"use client";
import { useId, useState } from "react";
import type { AppData } from "@/lib/types";
import * as M from "@/lib/maths";
import { IncomeSummary } from "./IncomeSummary";
type Assumptions = { monthlyDeposit: number; years: number };
const ranges = ["3m", "6m", "1y", "Max", "Future"] as const;
type Range = typeof ranges[number];
const rangeMonths: Record<Range, number> = { "3m": -3, "6m": -6, "1y": -12, Max: -12, Future: -12 };
const dateLabel = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const compactGBP = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 }).format(n);
/** Keep chart calculations separate from controls and accessible rendering. */
function balanceChart(data: AppData, range: Range, assumptions: Assumptions) {
  const today = M.ymd(new Date()); const currentMonth = today.slice(0, 7);
  const total = M.totalBalance(data.accounts);
  const historical = data.snapshots.filter(s => s.month < currentMonth).toSorted((a, b) => a.month.localeCompare(b.month)).map(s => ({ date: M.ymd(new Date(Date.UTC(+s.month.slice(0, 4), +s.month.slice(5, 7), 0))), balance: s.totalBalance }));
  const since = M.addMonths(today, rangeMonths[range]);
  const actual = [...historical.filter(p => range === "Future" || range === "Max" || p.date >= since), { date: today, balance: total }];
  const baseProjection = M.projection(data.accounts, assumptions.years * 12, assumptions.monthlyDeposit, today);
  const forecast = [{ date: today, balance: total, income: 0 }, ...baseProjection.map(p => ({ date: M.addMonths(today, p.month), balance: p.balance, income: p.income }))];
  const future = range === "Future"; const final = forecast.at(-1)!;
  const start = actual[0].date === today ? M.addMonths(today, -1) : actual[0].date;
  const end = future ? final.date : today;
  const time = (d: string) => Date.parse(d + "T00:00:00Z");
  const x = (d: string) => 12 + (time(d) - time(start)) / Math.max(1, time(end) - time(start)) * 308;
  const maximum = Math.max(1, ...actual.map(p => p.balance), ...(future ? forecast.map(p => p.balance) : []));
  const scale = Math.pow(10, Math.floor(Math.log10(maximum))); const ceiling = Math.ceil(maximum / scale) * scale;
  const y = (value: number) => 190 - value / ceiling * 166;
  const path = (points: typeof actual) => points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  return { today, total, actual, forecast, future, final, start, end, x, y, ceiling, path };
}

export function Trends({ data, onAssumptions }: Readonly<{ data: AppData; onAssumptions: (value: Assumptions) => boolean | Promise<boolean> }>) {
  const [range, setRange] = useState<Range>("Future"); const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState("");
  const assumptions = data.projection ?? { monthlyDeposit: 0, years: 1 };
  const [deposit, setDeposit] = useState(String(assumptions.monthlyDeposit)); const [years, setYears] = useState(assumptions.years);
  const fillId = useId();
  const { today, total, actual, forecast, future, final, start, end, x, y, ceiling, path } = balanceChart(data, range, assumptions);
  const br = M.momBreakdown(data.snapshots); const growth = br ? br.growthPct : M.momGrowth(data.snapshots);
  const validDeposit = deposit.trim() !== "" && Number.isFinite(Number(deposit)) && Number(deposit) >= 0 && Number(deposit) <= 1_000_000;
  const yearLabel = `${assumptions.years} ${assumptions.years === 1 ? "year" : "years"}`;
  const heading = future ? `Estimated balance in ${yearLabel}` : "Your balance today";
  const chartExplanation = future
    ? ` Estimated ${M.gbp(final.balance)} by ${dateLabel(final.date)}. Dashed lines show estimates.`
    : " Solid line shows recorded monthly balances.";
  let growthLabel = "—";
  if (growth !== null) {
    const prefix = growth >= 0 ? "+" : "";
    growthLabel = `${prefix}${growth.toFixed(1)}%`;
  }
  return <>
    <h1>Trends</h1>
    <p className="muted">{heading}</p>
    <div className="big">{M.gbp(future ? final.balance : total)}</div>
    <p className="muted">{future ? `${M.gbp(total)} today · ${M.gbp(assumptions.monthlyDeposit)} planned monthly top-up` : "Based on recorded monthly balances"}</p>
    <section className="panel trend-panel" aria-label="Balance chart">
      <svg className="trend-chart" viewBox="0 0 400 235" role="img" aria-label={`Recorded balance ${M.gbp(total)} today.${chartExplanation}`}>
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
      <fieldset className="range-picker"><legend className="sr-only">Chart period</legend>{ranges.map(value => <button type="button" key={value} aria-pressed={range === value} className={range === value ? "selected" : ""} onClick={() => setRange(value)}>{value}</button>)}</fieldset>
      <div className="chart-legend"><span><i className="legend-actual" />Recorded balance</span>{future && <><span><i className="legend-projection" />Estimated balance</span><span><i className="legend-baseline" />Today’s balance + planned top-ups</span></>}</div>
      {actual.length < 2 && <p className="muted">Your history starts today. Recorded balances will build as you use Drip.</p>}
      {future && <>
        <p className="muted">Uses current rates or dividend yields and each account&apos;s reinvestment setting. Income is averaged monthly; future-dated pending bonuses are included once. Top-ups arrive at month end, split by today&apos;s account balances, with no withdrawals or investment price changes. Estimates are before tax and fees; actual returns can differ. Income paid out isn&apos;t added to the projected account balance.</p>
        <button className="btn ghost" disabled={saving} aria-expanded={editing} onClick={() => setEditing(!editing)}>Edit projection</button>
        {editing && <form aria-label="Projection assumptions" onSubmit={async event => {
          event.preventDefault(); if (!validDeposit || saving) return;
          setSaving(true); setSaveError("");
          try {
            if (await onAssumptions({ monthlyDeposit: Number(deposit), years })) setEditing(false);
            else setSaveError("Projection could not be saved. Your entries are kept; retry Save projection.");
          } catch { setSaveError("Projection could not be saved. Your entries are kept; retry Save projection."); }
          finally { setSaving(false); }
        }}>
          <label htmlFor="projection-deposit">Planned monthly top-up (£)</label><input disabled={saving} id="projection-deposit" type="number" min="0" max="1000000" step="0.01" value={deposit} onChange={e => setDeposit(e.target.value)} />
          <label htmlFor="projection-years">Project ahead</label><select disabled={saving} id="projection-years" value={years} onChange={e => setYears(Number(e.target.value))}>{[1, 3, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? "year" : "years"}</option>)}</select>
          <div className="row-gap"><button type="submit" className="btn" disabled={!validDeposit || saving}>{saving ? "Saving projection…" : "Save projection"}</button></div>
          {saveError && <p role="alert" className="err">{saveError}</p>}
        </form>}
      </>}
      <details className="chart-table"><summary>View chart figures</summary><table><thead><tr><th>Date</th><th>Balance</th><th>Type</th></tr></thead><tbody>{actual.map(p => <tr key={p.date}><td>{p.date === today ? "Today" : dateLabel(p.date)}</td><td>{M.gbp(p.balance)}</td><td>Recorded</td></tr>)}{future && forecast.slice(1).map(p => <tr key={p.date}><td>{dateLabel(p.date)}</td><td>{M.gbp(p.balance)}</td><td>Estimate</td></tr>)}</tbody></table></details>
    </section>
    <div className="grid">
      <div className="stat"><div className="muted">Total balance</div><div className="v">{M.gbp(total)}</div></div>
      <div className="stat"><div className="muted">Estimated monthly income</div><div className="v">{M.gbp(M.totalMonthlyIncome(data.accounts))}</div></div>
      <div className="stat"><div className="muted">Weighted yield</div><div className="v">{M.weightedYield(data.accounts).toFixed(2)}%</div></div>
      <div className="stat"><div className="muted">Balance change after logged transfers</div><div className="v">{growthLabel}</div></div>
    </div>
    {future && <p className="muted">Predicted income over {assumptions.years} {assumptions.years === 1 ? "year" : "years"}: <b>{M.gbp(final.income)}</b>. This includes income paid out and excludes your deposits.</p>}
    <IncomeSummary accounts={data.accounts} />
    {br && <div className="panel"><h2>This month vs last</h2><ul className="list"><li><span>Top-ups (your deposits)</span><b>{M.gbp(br.deposits)}</b></li><li><span>Withdrawals</span><b>{br.withdrawals ? "−" : ""}{M.gbp(br.withdrawals)}</b></li><li><span>Other balance movement</span><b>{br.growth >= 0 ? "+" : ""}{M.gbp(br.growth)} ({br.growthPct.toFixed(2)}%)</b></li><li><span>Total change</span><b>{M.gbp(br.change)}</b></li></ul><p className="muted">Other balance movement can include returns, corrections and unlogged transfers. It isn&apos;t recorded income.</p></div>}
    {growth === null && <p className="muted">Month-on-month growth appears after Drip has two months of history.</p>}
  </>;
}
