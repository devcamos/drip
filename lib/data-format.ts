/** Older clients discard unknown financial fields. Feature-bearing encrypted
 * copies must use a version they reject before restoring or rewriting data. */
export function dataFormatVersion(data: unknown): 1 | 2 | 3 {
  if (!data || typeof data !== "object" || !("accounts" in data) || !Array.isArray(data.accounts)) return 1;
  if (data.accounts.some(account => account && typeof account === "object" && (account.productCategory === "credit-card" || account.creditCard !== undefined || account.marketValuation !== undefined))) return 3;
  return data.accounts.some(account => account && typeof account === "object" && account.investment !== undefined) ? 2 : 1;
}
