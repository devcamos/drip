import type { Account } from "./types";
import { addMonths, monthlyIncome, round2, totalBalance, weightedYield } from "./maths";
import { validDate } from "./products";

export type IncomePeriod = "month" | "year" | "all";
export function dividendIncome(accounts: Account[], asOf: string, period: IncomePeriod = "all") {
  return round2(accounts.reduce((sum, account) => sum + account.payouts.filter(payment =>
    payment.kind === "actual" && (payment.incomeType ?? account.rateType) === "dividend" && validDate(payment.date) && payment.date <= asOf &&
    (period === "all" || payment.date.startsWith(asOf.slice(0, period === "month" ? 7 : 4))) && Number.isFinite(payment.amount) && payment.amount > 0,
  ).reduce((amount, payment) => amount + payment.amount, 0), 0));
}
export function dividendPortfolio(accounts: Account[], asOf: string) {
  const holdings = accounts.filter(account => account.rateType === "dividend");
  const monthlyEstimate = holdings.reduce((sum, holding) => sum + monthlyIncome(holding.balance, holding.ratePct), 0);
  const history = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(`${asOf.slice(0, 7)}-01`, index - 5).slice(0, 7);
    const filtered = holdings.map(holding => ({ ...holding, payouts: holding.payouts.filter(payment => payment.date.startsWith(month)) }));
    return { month, income: dividendIncome(filtered, asOf) };
  });
  return { holdings, value: totalBalance(holdings), yieldPct: weightedYield(holdings), monthlyEstimate, annualEstimate: monthlyEstimate * 12,
    received: dividendIncome(holdings, asOf), thisMonth: dividendIncome(holdings, asOf, "month"), thisYear: dividendIncome(holdings, asOf, "year"), history };
}
