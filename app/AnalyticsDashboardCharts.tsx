"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { gbp } from "@/lib/maths";
import type { analyticsDashboardModel } from "@/lib/analytics-dashboard";
import s from "./analytics-dashboard-charts.module.css";

type ChartData = ReturnType<typeof analyticsDashboardModel>["charts"];
type ChartView = "income" | "assets" | "debt";
type PieSlice = { id: string; label: string; value: number };
const colors = ["#b85c2b", "#397c69", "#637bb5"];
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

function linePath(values: number[]) {
  const max = Math.max(...values, 1);
  const left = 54, right = 692, top = 24, bottom = 190;
  return values.map((value, index) => {
    const x = left + (right - left) * index / Math.max(1, values.length - 1);
    const y = bottom - (bottom - top) * value / max;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function slicePath(start: number, end: number, total: number) {
  const cx = 110, cy = 110, radius = 92;
  const a = -Math.PI / 2 + Math.PI * 2 * start / total;
  const b = -Math.PI / 2 + Math.PI * 2 * end / total;
  const x1 = cx + radius * Math.cos(a), y1 = cy + radius * Math.sin(a);
  const x2 = cx + radius * Math.cos(b), y2 = cy + radius * Math.sin(b);
  const large = end - start > total / 2 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function PieFigure({ title, description, centerLabel, slices, note, empty }: Readonly<{
  title: string; description: string; centerLabel: string; slices: PieSlice[]; note: string; empty: string;
}>) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return <figure className={s.figure} aria-label={`${title} chart`}>
    <figcaption><strong>{title}</strong><span>{description}</span></figcaption>
    {total > 0 ? <div className={s.pieLayout}>
      <svg className={s.pieChart} viewBox="0 0 220 220" role="img" aria-label={`${title} totalling ${gbp(total)}: ${slices.map(slice => `${slice.label} ${gbp(slice.value)}`).join(", ")}`}>
        {slices.length === 1 ? <circle cx="110" cy="110" r="92" fill={colors[0]}/> : slices.reduce<{ prior: number; paths: ReactNode[] }>((state, slice, index) => {
          const end = state.prior + slice.value;
          state.paths.push(<path key={slice.id} d={slicePath(state.prior, end, total)} fill={colors[index % colors.length]}/>);
          state.prior = end;
          return state;
        }, { prior: 0, paths: [] }).paths}
        <circle cx="110" cy="110" r="49" fill="var(--panel)"/>
        <text x="110" y="105" textAnchor="middle" className={s.pieTotalLabel}>{centerLabel.toUpperCase()}</text><text x="110" y="127" textAnchor="middle" className={s.pieTotal}>{gbp(total)}</text>
      </svg>
      <ul className={s.legend}>{slices.map((slice, index) => <li key={slice.id}><span className={s.swatch} style={{ "--swatch": colors[index % colors.length] } as CSSProperties}/><span>{slice.label}<small>{(slice.value / total * 100).toFixed(1)}%</small></span><b>{gbp(slice.value)}</b></li>)}</ul>
    </div> : <p className={s.empty}>{empty}</p>}
    <p className={s.note}>{note}</p>
  </figure>;
}

export function AnalyticsDashboardCharts({ charts }: Readonly<{ charts: ChartData }>) {
  const [view, setView] = useState<ChartView>("income");
  const maxMonthlyIncome = Math.max(...charts.incomeTrend.map(point => point.income), 0);
  const allocation = charts.allocation.filter(slice => slice.value > 0);

  return <section className={s.panel} aria-labelledby="dashboard-charts-title">
    <div className={s.header}><div><p className={s.kicker}>YOUR DATA, VISUALISED</p><h2 id="dashboard-charts-title">Dashboard charts</h2></div>
      <div className={s.switch} role="group" aria-label="Dashboard chart view">
        <button type="button" aria-pressed={view === "income"} onClick={() => setView("income")}>Income</button>
        <button type="button" aria-pressed={view === "assets"} onClick={() => setView("assets")}>Assets</button>
        <button type="button" aria-pressed={view === "debt"} onClick={() => setView("debt")}>Debt</button>
      </div>
    </div>
    {view === "income" ? <figure className={s.figure} aria-label="Estimated monthly income chart">
      <figcaption><strong>Estimated income by month</strong><span>Next 12 months · based on saved balances and rates</span></figcaption>
      {maxMonthlyIncome > 0 ? <>
        <svg className={s.lineChart} viewBox="0 0 720 230" role="img" aria-label={`Estimated monthly income over the next 12 months, from ${gbp(charts.incomeTrend[0]?.income ?? 0)} to ${gbp(charts.incomeTrend.at(-1)?.income ?? 0)} per month`}>
          {[0, 0.5, 1].map(fraction => { const y = 190 - 166 * fraction; return <g key={fraction}><line x1="54" x2="692" y1={y} y2={y} className={s.gridline}/><text x="46" y={y + 4} textAnchor="end" className={s.axis}>{gbp(maxMonthlyIncome * fraction)}</text></g>; })}
          <path d={linePath(charts.incomeTrend.map(point => point.income))} className={s.line}/>
          {charts.incomeTrend.map((point, index) => { const x = 54 + 638 * index / 11, y = 190 - 166 * point.income / Math.max(maxMonthlyIncome, 1); return <circle key={point.month} cx={x} cy={y} r="4" className={s.dot}/>; })}
          {charts.incomeTrend.map((point, index) => index % 2 === 0 || index === 11 ? <text key={point.month} x={54 + 638 * index / 11} y="218" textAnchor="middle" className={s.axis}>{monthLabel(point.month)}</text> : null)}
        </svg>
        <ul className={s.dataList} aria-label="Monthly estimate values">{charts.incomeTrend.map(point => <li key={point.month}><span>{monthLabel(point.month)}</span><b>{gbp(point.income)}</b></li>)}</ul>
      </> : <p className={s.empty}>Add an account with an interest rate or dividend yield to see an income forecast.</p>}
      <p className={s.note}>This is a forecast, not a payment schedule. Actual payments are tracked separately.</p>
    </figure> : view === "assets" ? <PieFigure title="Asset mix" description="Saved asset balances · debt shown separately" centerLabel="Assets" slices={allocation} note="Each account appears in one slice. An ISA wrapper takes priority for dividend holdings inside an ISA. Debt is excluded." empty="Add an account with a positive balance to see your asset mix."/> : <PieFigure title="Debt by account" description="Current amounts owed · income and assets shown separately" centerLabel="Debt" slices={charts.debtBreakdown} note="This compares recorded debt balances. It does not include projected income or estimate future interest." empty="Add a credit-card account with an amount owed to see your debt breakdown."/>}
  </section>;
}
