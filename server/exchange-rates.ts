import { parseFxRate, type FxCurrency } from "../lib/exchange-rates";

/** Only a public currency pair goes upstream. Never forward a request URL,
 * cookies, identity, holdings, quantities, purchase prices or balances.
 */
export async function fetchExchangeRate(base: FxCurrency, fetcher: typeof fetch = fetch, now = Date.now()) {
  const response = await fetcher(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=GBP`, {
    headers: { Accept: "application/json" }, credentials: "omit", redirect: "error",
    // Cache only the validated public route response. A malformed upstream 200
    // must not be kept in the framework fetch cache and block a healthy retry.
    signal: AbortSignal.timeout(5000), cache: "no-store",
  });
  if (!response.ok || Number(response.headers.get("content-length")) > 16_384) throw new Error("Exchange rate unavailable.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Exchange rate unavailable.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); throw new Error("Exchange rate unavailable."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const rate = Array.isArray(body) && body.length === 1 ? parseFxRate(body[0], base, now) : null;
  if (!rate) throw new Error("Exchange rate unavailable.");
  return rate;
}
