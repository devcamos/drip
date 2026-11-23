import type { Account } from "./types";

export const ACCOUNT_REVIEW_INTERVAL_DAYS = 30;
export type ReviewFieldKey = "balanceReviewedAt" | "rateReviewedAt" | "paymentDateReviewedAt";
export type ReviewField = Readonly<{ key: ReviewFieldKey; label: string; lastReviewedAt?: string; due: boolean; dueDate?: string }>;

export function validReviewDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function validAccountReviewFields(account: Account): boolean {
  return ([account.balanceReviewedAt, account.rateReviewedAt, account.paymentDateReviewedAt] as const).every(value => value === undefined || validReviewDate(value));
}

export function accountReviewDueDate(lastReviewedAt: string | undefined): string | undefined {
  if (!validReviewDate(lastReviewedAt)) return undefined;
  const date = new Date(`${lastReviewedAt}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + ACCOUNT_REVIEW_INTERVAL_DAYS);
  return date.toISOString().slice(0, 10);
}

export function accountReviewFields(account: Account, today: string): ReviewField[] {
  const raw: { key: ReviewFieldKey; label: string; lastReviewedAt?: string }[] = [
    { key: "balanceReviewedAt", label: "Balance", lastReviewedAt: account.balanceReviewedAt },
    { key: "rateReviewedAt", label: account.creditCard ? "APR" : account.rateType === "dividend" ? "Dividend yield" : "Interest rate", lastReviewedAt: account.rateReviewedAt },
    ...(account.frequency === "daily" ? [] : [{ key: "paymentDateReviewedAt" as const, label: account.creditCard ? "Payment due date" : "Expected payment date", lastReviewedAt: account.paymentDateReviewedAt }]),
  ];
  return raw.map(field => {
    const dueDate = accountReviewDueDate(field.lastReviewedAt);
    return { ...field, dueDate, due: !dueDate || dueDate <= today };
  });
}

export function accountsNeedingReview(accounts: Account[], today: string) {
  return accounts.flatMap(account => {
    const fields = accountReviewFields(account, today).filter(field => field.due);
    return fields.length ? [{ account, fields }] : [];
  });
}

export function confirmAccountFiguresReviewed(account: Account, today: string): Account {
  return {
    ...account,
    balanceReviewedAt: today,
    rateReviewedAt: today,
    ...(account.frequency === "daily" ? {} : { paymentDateReviewedAt: today }),
  };
}
