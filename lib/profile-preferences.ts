import { getItem, setItem } from "./db";

export type IncomePeriod = "month" | "year";
const key = (identityId: string) => `income-period:${identityId}`;
/** A display preference only; no financial data. Scoped to this identity/device. */
export async function readIncomePeriod(identityId: string): Promise<IncomePeriod> {
  const value = await getItem<unknown>(key(identityId));
  return value === "year" ? "year" : "month";
}
export async function saveIncomePeriod(identityId: string, value: IncomePeriod): Promise<void> {
  await setItem(key(identityId), value);
}
