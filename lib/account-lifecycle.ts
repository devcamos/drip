import type { Account } from "./types";

type Lifecycle = Partial<Pick<Account, "archivedAt">>;
export const isArchivedAccount = (account: Lifecycle) => account.archivedAt !== undefined;
export function activeAccounts<T extends Lifecycle>(accounts: T[]): T[] {
  return accounts.filter(account => !isArchivedAccount(account));
}
export function validLifecycleFields(account: Account): boolean {
  const at = account.archivedAt;
  return (at === undefined || (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(at) && Number.isFinite(Date.parse(at)) && new Date(at).toISOString() === at)) &&
    (account.positionReviewRequired === undefined || (account.positionReviewRequired === true && account.rateType === "dividend" && !!account.investment));
}
/** Archiving retains the complete record; it never sells an investment. */
export function archiveAccount(account: Account, at = new Date().toISOString()): Account {
  const archived = { ...account, archivedAt: at };
  if (!validLifecycleFields(archived)) throw new Error("Use a valid archive date.");
  return archived;
}
export function restoreAccount(account: Account): Account {
  const { archivedAt: _archived, ...active } = account;
  return active;
}
