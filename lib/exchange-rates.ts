export type FxCurrency = "USD" | "EUR";
export type FxRate = { base: FxCurrency; quote: "GBP"; rate: number; date: string; source: "Frankfurter" };
export const isFxCurrency = (value: unknown): value is FxCurrency => value === "USD" || value === "EUR";
const day = 86_400_000;

/** Daily reference rates can span weekends/holidays; never present an old or
 * future provider date as a fresh rate. Fetch time is not the rate's date.
 */
export function parseFxRate(value: unknown, base: FxCurrency, now = Date.now()): FxRate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.base !== base || v.quote !== "GBP" || typeof v.rate !== "number" || !Number.isFinite(v.rate) || v.rate <= 0 || v.rate > 1_000_000 || typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return null;
  const timestamp = Date.parse(v.date + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== v.date || timestamp > now || Math.floor(now / day) * day - timestamp > 7 * day) return null;
  return { base, quote: "GBP", rate: v.rate, date: v.date, source: "Frankfurter" };
}

/** Local estimate only: no change to recorded balance, acquisition cost or yield. */
export function convertedHolding(price: string, shares: number, rate: number) {
  if (!price.trim()) return null;
  const native = Number(price), perShareGBP = native * rate, valueGBP = shares * perShareGBP;
  const valid = (n: number) => Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER / 100;
  if (!valid(native) || !Number.isFinite(shares) || shares < 0 || shares > Number.MAX_SAFE_INTEGER || !Number.isFinite(rate) || rate <= 0 || !valid(perShareGBP) || !valid(valueGBP)) return null;
  return { perShareGBP, valueGBP };
}
