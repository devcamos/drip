import type { Account, AppData } from "./types";
import { fromStoredPence, hasPenceMarker, isStoredPenceAppData, toStoredPence, type StoredPenceAppData } from "./money-storage";

/** The sync boundary is an allowlist. New local fields do not become portable by default. */
export function cloudPayload(data: AppData): StoredPenceAppData {
  const stored = toStoredPence(portableCloudData(data));
  return { ...stored, accounts: stored.accounts.map(({ label: _deviceLabel, ...account }) => account) } as StoredPenceAppData;
}

function portableCloudData(data: AppData): AppData {
  const { version, lastBackupAt, identity, projection } = data;
  return {
    version, lastBackupAt,
    identity: identity ? { id: identity.id, handle: identity.handle, suffix: identity.suffix, createdAt: identity.createdAt } : undefined,
    projection: projection ? { monthlyDeposit: projection.monthlyDeposit, years: projection.years } : undefined,
    snapshots: data.snapshots.map(({ month, totalBalance, monthlyIncome, deposits, withdrawals }) => ({ month, totalBalance, monthlyIncome, deposits, withdrawals })),
    accounts: data.accounts.map(({ id, provider, archivedAt, positionReviewRequired, balanceReviewedAt, rateReviewedAt, paymentDateReviewedAt, holdingName, investment, creditCard, marketValuation, balance, label: _label, ratePct, rateType, productCategory, taxWrapper, reinvestIncome, bonus, frequency, nextPayoutDate, colour, payouts, events, accruedThrough, rateHistory, createdAt }): Account => ({
      id, provider, label: "", balance, ratePct, rateType, frequency, nextPayoutDate, colour, accruedThrough, createdAt,
      archivedAt, positionReviewRequired, balanceReviewedAt, rateReviewedAt, paymentDateReviewedAt,
      productCategory, taxWrapper, reinvestIncome, holdingName,
      investment: investment ? { shares: investment.shares, averagePriceGBP: investment.averagePriceGBP,
        originalPrice: investment.originalPrice ? { currency: investment.originalPrice.currency, averagePrice: investment.originalPrice.averagePrice } : undefined } : undefined,
      creditCard: creditCard ? { apr: creditCard.apr, minimumPayment: creditCard.minimumPayment, ...(creditCard.plannedPayment === undefined ? {} : { plannedPayment: creditCard.plannedPayment }), ...(creditCard.statementPaid ? { statementPaid: true } : {}) } : undefined,
      marketValuation: marketValuation ? { priceUSD: marketValuation.priceUSD, fxRate: marketValuation.fxRate, fxDate: marketValuation.fxDate, appliedAt: marketValuation.appliedAt, recordedBalance: marketValuation.recordedBalance } : undefined,
      bonus: bonus ? { amount: bonus.amount, expectedDate: bonus.expectedDate } : undefined,
      payouts: payouts.map(({ id: payoutId, date, amount, kind, incomeType }) => ({ id: payoutId, date, amount, kind, incomeType })),
      events: events?.map(({ id: eventId, type, date, amount }) => ({ id: eventId, type, date, amount })),
      rateHistory: rateHistory?.map(({ from, ratePct }) => ({ from, ratePct })),
    })),
  };
}

/** Older cloud copies may contain device fields; never import those onto another device. */
export function fromCloudPayload(data: unknown): AppData {
  const decoded = hasPenceMarker(data) ? fromStoredPence(data) : data;
  if (!isAppData(decoded)) throw new Error("Invalid cloud copy.");
  return portableCloudData(decoded);
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("accounts" in value) || !Array.isArray(value.accounts) || !("snapshots" in value) || !Array.isArray(value.snapshots) || !("lastBackupAt" in value)) return false;
  return !hasPenceMarker(value) || isStoredPenceAppData(value);
}
