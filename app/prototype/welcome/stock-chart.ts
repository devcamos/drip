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
  // Use TradingView's stock overview: it renders even when third-party Web Locks
  // are denied. The advanced trading terminal required that optional API.
  // Source: official embed-widget-symbol-overview.js. Verify this display-only
  // embed contract in a secure Preview when upgrading; it is not a price API.
  const options = {
    symbols: [[instrument.name, `${instrument.symbol}|1D`]],
    dateRanges: [range === "1Y" ? "12m|1D" : `${range.toLowerCase()}|1D`],
    locale: "en",
    chartOnly: false,
    colorTheme: "light",
    isTransparent: false,
    showVolume: false,
    showMA: false,
    hideDateRanges: true,
    hideMarketStatus: false,
    hideSymbolLogo: false,
    scalePosition: "right",
    scaleMode: "Normal",
    noTimeScale: false,
    width: "100%",
    height: "100%",
    chartType: "area",
    lineWidth: 2,
    valuesTracking: "1",
    changeMode: "price-and-percent",
  };
  return {
    iframeUrl: `https://www.tradingview-widget.com/embed-widget/symbol-overview/?locale=en#${encodeURIComponent(JSON.stringify(options))}`,
    externalUrl: `https://www.tradingview.com/symbols/${instrument.symbol.replace(":", "-")}/`,
    symbol: instrument.symbol,
    currency: instrument.currency,
    label: instrument.name,
  };
}
