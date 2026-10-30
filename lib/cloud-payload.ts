import type { Account, AppData } from "./types";

/** The sync boundary is an allowlist. New local fields do not become portable by default. */
export function cloudPayload(data: AppData) {
  const { version, lastBackupAt, identity, projection, money } = data;
  return {
    version, money, lastBackupAt,
    identity: identity ? { id: identity.id, handle: identity.handle, suffix: identity.suffix, createdAt: identity.createdAt } : undefined,
    projection: projection ? { monthlyDeposit: projection.monthlyDeposit, years: projection.years } : undefined,
    snapshots: data.snapshots.map(({ month, totalBalance, monthlyIncome, deposits, withdrawals }) => ({ month, totalBalance, monthlyIncome, deposits, withdrawals })),
    accounts: data.accounts.map(({ id, provider, holdingName, balance, currency, ratePct, rateType, productCategory, taxWrapper, reinvestIncome, bonus, frequency, nextPayoutDate, colour, payouts, events, accruedThrough, rateHistory, createdAt }): Omit<Account, "label"> => ({
      id, provider, balance, currency, ratePct, rateType, frequency, nextPayoutDate, colour, accruedThrough, createdAt,
      productCategory, taxWrapper, reinvestIncome, holdingName,
      bonus: bonus ? { amount: bonus.amount, expectedDate: bonus.expectedDate } : undefined,
      payouts: payouts.map(({ id: payoutId, date, amount, kind, incomeType }) => ({ id: payoutId, date, amount, kind, incomeType })),
      events: events?.map(({ id: eventId, type, date, amount }) => ({ id: eventId, type, date, amount })),
      rateHistory: rateHistory?.map(({ from, ratePct }) => ({ from, ratePct })),
    })),
  };
}

/** Older cloud copies may contain device fields; never import those onto another device. */
export function fromCloudPayload(data: AppData): AppData {
  const portable = cloudPayload(data);
  return { ...portable, accounts: portable.accounts.map(account => ({ ...account, label: "" })) };
}
