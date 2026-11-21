import type { Account } from "./types";
import { projection, recordedIncome, round2 } from "./maths";
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
  const annualEstimate = round2(projection(assets, 12, 0, today).at(-1)?.income ?? 0);
  const month = today.slice(0, 7);
  const dividendReceivedThisMonth = round2(dividends.reduce((sum, a) => sum + a.payouts.filter(p => p.kind === "actual" && (p.incomeType ?? a.rateType) === "dividend" && p.date <= today && p.date.startsWith(month) && Number.isFinite(p.amount) && p.amount > 0).reduce((n, p) => n + p.amount, 0), 0));
  return {
    totals: { assets: round2(assets.reduce((n,a) => n + Math.max(a.balance,0),0)), debt: round2(debt.reduce((n,a) => n + Math.max(a.balance,0),0)), dividends: round2(dividends.reduce((n,a) => n + Math.max(a.balance,0),0)), isas: round2(isas.reduce((n,a) => n + Math.max(a.balance,0),0)) },
    counts: { assets: assets.length, debt: debt.length, dividends: dividends.length, isas: isas.length },
    income: { annualEstimate, monthlyEstimate: round2(annualEstimate / 12), receivedThisMonth: recordedIncome(assets, month, today), dividendReceivedThisMonth },
    rateComparison: card && saver && card.creditCard!.apr > saver.ratePct ? { card, saver, gap: round2(card.creditCard!.apr - saver.ratePct) } : null,
  };
}
