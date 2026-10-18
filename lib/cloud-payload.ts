import type { Account, AppData } from "./types";

/** The sync boundary is an allowlist. New local fields do not become portable by default. */
export function cloudPayload(data: AppData) {
  const { version, lastBackupAt, identity, projection } = data;
  return {
    version, lastBackupAt,
    identity: identity ? { id: identity.id, handle: identity.handle, suffix: identity.suffix, createdAt: identity.createdAt } : undefined,
    projection: projection ? { monthlyDeposit: projection.monthlyDeposit, years: projection.years } : undefined,
    snapshots: data.snapshots.map(({ month, totalBalance, monthlyIncome, deposits, withdrawals }) => ({ month, totalBalance, monthlyIncome, deposits, withdrawals })),
    accounts: data.accounts.map(({ id, provider, balance, ratePct, rateType, frequency, nextPayoutDate, colour, payouts, events, accruedThrough, rateHistory, createdAt }): Omit<Account, "label"> => ({
      id, provider, balance, ratePct, rateType, frequency, nextPayoutDate, colour, accruedThrough, createdAt,
      payouts: payouts.map(({ date, amount, kind }) => ({ date, amount, kind })),
      events: events?.map(({ type, date, amount }) => ({ type, date, amount })),
      rateHistory: rateHistory?.map(({ from, ratePct }) => ({ from, ratePct })),
    })),
  };
}

/** Older cloud copies may contain device fields; never import those onto another device. */
export function fromCloudPayload(data: AppData): AppData {
  const portable = cloudPayload(data);
  return { ...portable, accounts: portable.accounts.map(account => ({ ...account, label: "" })) };
}
