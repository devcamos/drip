import type { Account } from "./types";
import { addMonths, projection, recordedIncome, round2 } from "./maths";
import { isArchivedAccount } from "./account-lifecycle";
import { isCreditAccount } from "./credit-card";

const isa = (a: Account) => ["cash-isa", "lifetime-isa", "stocks-shares-isa"].includes(a.taxWrapper ?? "") || ["cash-isa", "cash-lisa"].includes(a.productCategory ?? "");
export function analyticsDashboardModel(accounts: Account[], today: string) {
  const active = accounts.filter(a => !isArchivedAccount(a));
  const assets = active.filter(a => !isCreditAccount(a)), debt = active.filter(isCreditAccount);
  const dividends = assets.filter(a => a.rateType === "dividend"), isas = assets.filter(isa);
  const savings = assets.filter(a => a.rateType === "interest" && a.ratePct > 0);
  const cards = debt.filter(a => (a.creditCard?.apr ?? 0) > 0);
  const card = cards.reduce<Account | undefined>((best, a) => !best || a.creditCard!.apr > best.creditCard!.apr ? a : best, undefined);
  const saver = savings.reduce<Account | undefined>((best, a) => !best || a.ratePct > best.ratePct ? a : best, undefined);
  const forecast = projection(assets, 12, 0, today);
  const annualEstimate = round2(forecast.at(-1)?.income ?? 0);
  const incomeTrend = forecast.map((point, index) => ({
    month: addMonths(today, index + 1).slice(0, 7),
    income: round2(point.income - (forecast[index - 1]?.income ?? 0)),
  }));
  // Put an account in exactly one slice so this chart is a true composition of assets.
  // ISA wrapper wins for dividend-paying Stocks and Shares ISAs; debt is excluded.
  const allocation = [
    { id: "isas", label: "ISAs", value: round2(isas.reduce((sum, a) => sum + Math.max(a.balance, 0), 0)) },
    { id: "dividends", label: "Dividends outside ISAs", value: round2(dividends.filter(a => !isa(a)).reduce((sum, a) => sum + Math.max(a.balance, 0), 0)) },
    { id: "other", label: "Other assets", value: round2(assets.filter(a => !isa(a) && a.rateType !== "dividend").reduce((sum, a) => sum + Math.max(a.balance, 0), 0)) },
  ];
  const debtBreakdown = debt.map(a => ({
    id: a.id,
    label: a.label.trim() || a.provider,
    value: round2(Math.max(a.balance, 0)),
  })).filter(account => account.value > 0);
  const month = today.slice(0, 7);
  const dividendReceivedThisMonth = round2(dividends.reduce((sum, a) => sum + a.payouts.filter(p => p.kind === "actual" && (p.incomeType ?? a.rateType) === "dividend" && p.date <= today && p.date.startsWith(month) && Number.isFinite(p.amount) && p.amount > 0).reduce((n, p) => n + p.amount, 0), 0));
  return {
    totals: { assets: round2(assets.reduce((n,a) => n + Math.max(a.balance,0),0)), debt: round2(debt.reduce((n,a) => n + Math.max(a.balance,0),0)), dividends: round2(dividends.reduce((n,a) => n + Math.max(a.balance,0),0)), isas: round2(isas.reduce((n,a) => n + Math.max(a.balance,0),0)) },
    counts: { assets: assets.length, debt: debt.length, dividends: dividends.length, isas: isas.length },
    income: { annualEstimate, monthlyEstimate: round2(annualEstimate / 12), receivedThisMonth: recordedIncome(assets, month, today), dividendReceivedThisMonth },
    charts: { incomeTrend, allocation, debtBreakdown },
    rateComparison: card && saver && card.creditCard!.apr > saver.ratePct ? { card, saver, gap: round2(card.creditCard!.apr - saver.ratePct) } : null,
  };
}
