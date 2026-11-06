import { expect, test } from "vitest";
import { chartRanges, STOCK_INSTRUMENTS, stockChartDescriptor, stockInstrument } from "../app/prototype/welcome/stock-chart";

test("the dividend catalogue distinguishes the six US listings, including the Brookfield partnership", () => {
  expect(STOCK_INSTRUMENTS.map(item => [item.id, item.symbol, item.currency])).toEqual([
    ["realty-income", "NYSE:O", "USD"], ["digital-realty", "NYSE:DLR", "USD"],
    ["prologis", "NYSE:PLD", "USD"], ["american-tower", "NYSE:AMT", "USD"],
    ["brookfield-infrastructure", "NYSE:BIP", "USD"], ["air-products", "NYSE:APD", "USD"],
  ]);
  expect(stockInstrument("brookfield-infrastructure")?.name).toBe("Brookfield Infrastructure Partners");
});

test("unknown identifiers cannot become an arbitrary URL or silently select another security", () => {
  for (const id of ["", "NYSE:O", "REALTY-INCOME", "__proto__", "https://example.com/", "realty-income<script>"]) {
    expect(stockInstrument(id)).toBeNull();
    expect(stockChartDescriptor(id, "3M")).toBeNull();
  }
});

test("the chart identity stays with its selected public listing and quote currency", () => {
  for (const instrument of STOCK_INSTRUMENTS) {
    const descriptor = stockChartDescriptor(instrument.id, "3M")!;
    const options = JSON.parse(decodeURIComponent(new URL(descriptor.iframeUrl).hash.slice(1)));
    expect(descriptor.label).toBe(instrument.name);
    expect(descriptor.symbol).toBe(instrument.symbol);
    expect(descriptor.currency).toBe("USD");
    expect(options.symbol).toBe(instrument.symbol);
    expect(options.allow_symbol_change).toBe(false);
  }
});

test("supported month and year ranges use daily bars and the provider's twelve-month year syntax", () => {
  expect(chartRanges.map(range => range.label)).toEqual(["1 month", "3 months", "1 year"]);
  for (const [range, expected] of [["1M", "1M"], ["3M", "3M"], ["1Y", "12M"]]) {
    const options = JSON.parse(decodeURIComponent(new URL(stockChartDescriptor("realty-income", range)!.iframeUrl).hash.slice(1)));
    expect(options.range).toBe(expected);
    expect(options.interval).toBe("D");
  }
});

test("unsupported intervals and injected configuration fail closed before constructing a frame", () => {
  for (const range of ["", "1D", "ALL", "3m", '3M","symbol":"NASDAQ:AAPL', "__proto__"]) {
    expect(stockChartDescriptor("realty-income", range)).toBeNull();
  }
});

test("the provider boundary is fixed HTTPS and serializes only the public chart configuration", () => {
  const url = new URL(stockChartDescriptor("realty-income", "3M")!.iframeUrl);
  expect(url.origin).toBe("https://www.tradingview-widget.com");
  expect(url.pathname).toBe("/embed-widget/advanced-chart/");
  expect([...url.searchParams]).toEqual([["locale", "en"]]);
  expect(url.username + url.password).toBe("");
  const options = JSON.parse(decodeURIComponent(url.hash.slice(1)));
  expect(Object.keys(options).sort()).toEqual([
    "symbol", "interval", "range", "timezone", "theme", "style", "locale", "allow_symbol_change",
    "hide_side_toolbar", "hide_top_toolbar", "save_image", "calendar", "autosize", "support_host",
  ].sort());
  expect(options.support_host).toBe("https://www.tradingview.com");
});

test("fallback and attribution link to the same listing without account or holding query parameters", () => {
  for (const instrument of STOCK_INSTRUMENTS) {
    const url = new URL(stockChartDescriptor(instrument.id, "3M")!.externalUrl);
    expect(url.origin).toBe("https://www.tradingview.com");
    expect(url.pathname).toBe(`/symbols/${instrument.symbol.replace(":", "-")}/`);
    expect(url.search + url.hash).toBe("");
  }
});
