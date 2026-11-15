import { expect, test } from "vitest";
import { stockReadingLinks } from "../lib/stock-reading";

test("known holdings link directly to their company news", () => {
  const links = stockReadingLinks("Realty Income");
  expect(links[1].href).toBe("https://finance.yahoo.com/quote/O/news/");
  expect(new URL(links[0].href).searchParams.get("q")).toBe("Realty Income stock news");
});
test("known aliases resolve to the corresponding news ticker", () => {
  expect(stockReadingLinks("NYSE:DLR")[1].href).toBe("https://finance.yahoo.com/quote/DLR/news/");
});
test("custom holdings use a company search rather than guessing a ticker", () => {
  const yahoo = new URL(stockReadingLinks("Example Holdings")[1].href);
  expect(yahoo.pathname).toBe("/lookup");
  expect(yahoo.searchParams.get("s")).toBe("Example Holdings");
});
test("company names are encoded as data instead of becoming URL parameters", () => {
  const links = stockReadingLinks("Test & Co?#");
  expect(new URL(links[0].href).searchParams.get("q")).toBe("Test & Co?# stock news");
  expect(new URL(links[1].href).searchParams.get("s")).toBe("Test & Co?#");
});
test("user-entered URLs cannot change the destination host", () => {
  for (const link of stockReadingLinks("https://evil.example/steal")) expect(["news.google.com", "finance.yahoo.com"]).toContain(new URL(link.href).hostname);
});
test("missing or whitespace names do not produce a misleading search", () => {
  expect(stockReadingLinks(undefined)).toEqual([]);
  expect(stockReadingLinks("  ")).toEqual([]);
});
test("outer whitespace is excluded from searches", () => {
  expect(new URL(stockReadingLinks("  Example  ")[1].href).searchParams.get("s")).toBe("Example");
});
