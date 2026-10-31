import { isFxCurrency } from "@/lib/exchange-rates";
import { fetchExchangeRate } from "@/server/exchange-rates";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const base = query.get("base");
  if (query.size !== 1 || !isFxCurrency(base)) return Response.json({ error: "Choose USD or EUR to convert to GBP." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const rate = await fetchExchangeRate(base);
    // Public, non-personal blended reference rates. Shared caching reduces
    // requests; a response never contains an account's financial information.
    return Response.json(rate, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    console.error("Drip daily exchange rate unavailable.", { provider: "Frankfurter", base });
    return Response.json({ error: "Daily exchange rates are unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
