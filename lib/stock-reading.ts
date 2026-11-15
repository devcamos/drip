import { instrumentForHolding } from "./stock-chart";

/** Construct public links only; never include account data in a source URL. */
export function stockReadingLinks(holdingName: string | undefined) {
  const name = holdingName?.trim();
  if (!name) return [];
  const instrument = instrumentForHolding(name);
  const query = new URLSearchParams({ q: `${name} stock news` });
  const yahoo = instrument
    ? `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol.split(":")[1])}/news/`
    : `https://finance.yahoo.com/lookup?${new URLSearchParams({ s: name })}`;
  return [
    { name: "Google News", description: "Recent coverage from a range of publishers", href: `https://news.google.com/search?${query}` },
    { name: "Yahoo Finance", description: instrument ? "Company news and financial updates" : "Find this company and its financial updates", href: yahoo },
  ];
}
