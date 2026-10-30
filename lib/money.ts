/** Stored money is integer pence. User input and display use pounds. */

export type Currency = "GBP";

/** Convert a pound amount (from user input or legacy storage) to integer pence. */
export function toPence(pounds: number): number {
  if (!Number.isFinite(pounds)) throw new Error("Amount must be a finite number.");
  return Math.round(pounds * 100);
}

/** Pence → pounds for display math that still wants a float. */
export function fromPence(pence: number): number {
  return pence / 100;
}

export function isPence(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/** Format integer (or nearly-integer) pence as £x.xx. Display stays 2dp. */
export function gbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Math.round(pence) / 100);
}
