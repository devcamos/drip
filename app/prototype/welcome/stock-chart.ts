/** Public market identifiers only. Never pass a holding or a session to the widget. */
export const STOCK_INSTRUMENTS = [
  { id: "realty-income", name: "Realty Income", symbol: "NYSE:O", currency: "USD" },
  { id: "digital-realty", name: "Digital Realty", symbol: "NYSE:DLR", currency: "USD" },
  { id: "prologis", name: "Prologis", symbol: "NYSE:PLD", currency: "USD" },
  { id: "american-tower", name: "American Tower", symbol: "NYSE:AMT", currency: "USD" },
  { id: "brookfield-infrastructure", name: "Brookfield Infrastructure Partners", symbol: "NYSE:BIP", currency: "USD" },
  { id: "air-products", name: "Air Products and Chemicals", symbol: "NYSE:APD", currency: "USD" },
] as const;

export type StockInstrument = typeof STOCK_INSTRUMENTS[number];
export const chartRanges = [
  { id: "1M", label: "1 month" },
  { id: "3M", label: "3 months" },
  { id: "1Y", label: "1 year" },
] as const;
export type ChartRange = typeof chartRanges[number]["id"];

export function stockInstrument(id: string): StockInstrument | null {
  return STOCK_INSTRUMENTS.find(instrument => instrument.id === id) ?? null;
}

export function stockChartDescriptor(id: string, range: string) {
  const instrument = stockInstrument(id);
  if (!instrument || !chartRanges.some(item => item.id === range)) return null;
  // This provider-origin frame URL is emitted by TradingView's official iframe
  // loader. It is not a raw-data API; verify the embed contract when upgrading.
  const options = {
    symbol: instrument.symbol,
    interval: "D",
    range: range === "1Y" ? "12M" : range,
    timezone: "Europe/London",
    theme: "light",
    style: "3",
    locale: "en",
    allow_symbol_change: false,
    hide_side_toolbar: true,
    hide_top_toolbar: false,
    save_image: false,
    calendar: false,
    autosize: true,
    support_host: "https://www.tradingview.com",
  };
  return {
    iframeUrl: `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(options))}`,
    externalUrl: `https://www.tradingview.com/symbols/${instrument.symbol.replace(":", "-")}/`,
    symbol: instrument.symbol,
    currency: instrument.currency,
    label: instrument.name,
  };
}
