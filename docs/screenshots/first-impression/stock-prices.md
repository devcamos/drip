# Dividend share-price prototype

The goal is to let someone explore a recorded dividend stock's price history before deciding whether to buy more shares. The prototype opens Realty Income's **NYSE:O** chart alongside a clearly separate sample holding. It does not trade, recommend a purchase or change recorded balances.

At `/prototype/welcome`, choose **Your accounts → Realty Income → Explore share price**. Choose **1M**, **3M** or **1Y**, then **Load TradingView chart**. A third-party connection starts only after that action. **Hide chart** removes the frame; **Back to accounts** returns to the holding. **Open chart on TradingView** is available if an embedded chart cannot load.

## Choice and reasons

**Use TradingView's free Symbol Overview for this shared Preview.** It provides a quote and price history without the advanced terminal's cross-tab coordination dependency. It needs no API key and is offered for website embedding. Keep its branding/attribution and link intact. This is a display integration, not a raw-price API or an automatic portfolio-valuation feed.

| Option | Free allowance / capability | What it means for Drip | Primary source |
| --- | --- | --- | --- |
| TradingView Symbol Overview | Free hosted quote and interactive price history; available data depends on market. | Suitable for a chart sample without managing an API key. NYSE widget data is listed as delayed Cboe One data; do not promise Trading212 execution prices or a consolidated real-time feed. | [Stock overview](https://www.tradingview.com/widget-docs/widgets/charts/symbol-overview/), [NYSE data level](https://www.tradingview.com/widget-docs/markets/north-america/), [data FAQ](https://www.tradingview.com/widget-docs/faq/data/) |
| Massive Stocks Basic | $0; 5 calls/minute; 2 years of end-of-day US history. | A possible owner-only personal API experiment. The vendor explicitly requires Business once another person sees it, including private testers/staging. Free Basic does not cover this shared Preview. | [Plans](https://massive.com/stocks), [display rights](https://massive.com/knowledge-base/article/which-plan-do-i-need-to-show-massive-data-in-my-app) |
| Twelve Data Basic | $0; 8 API credits/minute, 800/day. | The pricing card specifies internal non-display use. An API response alone does not establish permission for a user-facing chart. | [Pricing](https://twelvedata.com/pricing), [usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) |
| Alpha Vantage | 25 requests/day; real-time/15-minute US data is premium. | Useful for a small personal experiment, with private-use restrictions. A free shared Drip display licence was not established. | [Limits/key](https://www.alphavantage.co/support/), [terms](https://www.alphavantage.co/terms_of_service/) |

These are the options verified for this decision, not an exhaustive claim about every free provider. Finnhub's current free historical-candle entitlement could not be confirmed from readable primary documentation. Frankfurter supplies currency exchange rates, not stock prices.

## How the sample is architected

- **Identity:** the instrument catalogue maps names to exchange-qualified symbols and quote currency. The sample uses Realty Income, NYSE:O, USD. Brookfield Infrastructure Partners is explicitly BIP rather than a different Brookfield listing. [Instrument/configuration boundary](../../../app/prototype/welcome/stock-chart.ts).
- **Isolation:** a fixed cross-origin TradingView frame loads only on request. Remote provider code does not run in Drip's parent document. The frame gets a public symbol and chart settings; no gamertag, share count, average price, balance or recovery/session credential is serialized. TradingView necessarily receives the connection's IP and may observe the embedding context. [Provider privacy description](https://www.tradingview.com/widget-docs/faq/general/).
- **Honest prices:** delay/source information remains visible. The overview's price change refers to the selected market-history period, not the user's own investment return. Frame navigation is not proof that price data loaded, is current or is available for a particular listing. Provider branding and availability messages remain intact.
- **Separate records:** the sample's 50 shares, £2,500 recorded value, £48 average price, 5.4% recorded yield and £135 estimated annual income stay in GBP. The chart is USD. The UI does not compare those prices without FX, infer a GBP gain or overwrite saved values. [Stock detail UI](../../../app/prototype/welcome/StockPricePreview.tsx).
- **Embedding contract:** the frame URL follows the output of TradingView's current official iframe loader. It is not a separately documented stable data API; recheck it when changing the provider integration. [Official integration flow](https://www.tradingview.com/widget-docs/tutorials/iframe/build-page/widget-integration/).

A future custom API implementation should resolve the recorded instrument on the server, fetch permitted quote/history data through a provider adapter, validate and normalize it, cache/deduplicate requests, and return currency, market date, source and freshness. Rate-limit/entitlement failures should leave recorded holdings intact. A market estimate can then use **shares × price × dated FX**, clearly separate from recorded balance and received dividends. The widget's data must not be scraped or reused for those calculations.

## Screenshots

Captured from the running optimized Drip prototype at source `7b9aa66356a0e7d62ecd33e0359fb9963789e082`. Loaded-chart captures use the actual hosted Git Preview, 6 November 2026. Mobile 390×844 and desktop 1440×1000; the pre-load/recorded states were also checked at 320px. The loaded chart contains actual provider data at capture time, with TradingView branding intact; the recorded holding figures are synthetic. These are historical screenshots, not current quotes.

| State | Mobile | Desktop |
| --- | --- | --- |
| Before optional provider connection | [Detail](stock-detail-mobile.png) | [Detail](stock-detail-desktop.png) |
| Actual delayed market chart | [Chart](stock-market-mobile.png) | [Chart and recorded holding](stock-market-desktop.png) |
| Recorded GBP holding | [Figures](stock-recorded-mobile.png) | [Alongside chart](stock-market-desktop.png) |

[Mobile chart after normal scrolling, including attribution](stock-market-mobile-scrolled.png). Screenshots were opened and visually inspected. No synthetic price line or intercepted frame is used in these loaded-chart captures.

## Verification

| Claim | Expected / observed | Evidence and environment |
| --- | --- | --- |
| Correct instrument and configuration | Known exchange-qualified listings resolve correctly; invalid IDs/ranges fail closed; 1Y maps to 12 months; daily bars are used throughout. Only public chart settings cross the fixed HTTPS provider boundary. Passed. | [Seven isolated units](../../../tests/stock-chart.test.ts), source `7b9aa66` |
| Consent and holding separation | No iframe before Load; selected range applies; Hide/Back/Close remove the frame and restore focus. GBP holdings and income remain unchanged. Frame load does not claim current prices. Passed. | [Two real React component interactions](../../../tests/stock-chart.integration.test.tsx); component-state prototype, no primary datastore |
| Core app journey | Accounts → Realty Income → price view → optional chart → return preserves recorded money/income and mobile layout. Passed. | [One Chromium journey](../../../e2e/stock-chart.e2e.spec.ts), optimized local app. Its frame transport is explicitly a deterministic fixture, not proof of prices. New suite is 7/2/1, exactly 70/20/10. |
| Actual external data renders inside Drip | Both desktop and mobile loaded the real NYSE:O one-year plot, correct company, USD/delay labels and branding. Seven canvases each; no page errors, failed requests or horizontal overflow. Passed at capture time. | Actual hosted Git Preview at `7b9aa66`, matching build fingerprint, Chromium 156 in a disposable container, managed proxy and normal TLS verification. Web Locks remained denied throughout. [Desktop](stock-market-desktop.png), [mobile](stock-market-mobile.png), [scrolled attribution](stock-market-mobile-scrolled.png) |
| Existing app regressions | 783 unique cases passed; existing thresholds preserved, audit 0. The three inherited historical old-build PWA checks remain conditional. | [Full executed report](regression-report.md) from source `7b9aa66`; Git checks must also pass on the published evidence commit. |

The first host-browser attempt failed certificate trust through the environment proxy. The isolated container used a fresh task-owned certificate store to trust the supplied runtime CA; no host trust store or TLS validation was weakened. The successful actual-data check supersedes that connectivity limitation.

This verifies the Realty Income sample, not every catalogue symbol, independent price accuracy, execution prices, a hosted user login or a physical iPhone/PWA. Hosted deployment identity and current-head checks are recorded with the PR after Git Preview delivery. No raw-price API key, authenticated provider API or automatic valuation was configured.

The advanced chart previously raised two provider-origin SecurityErrors in this same restricted third-party context. Symbol Overview passes the strict hosted exception gate without changing iframe permissions or browser privacy. The provider still emits resource-preload performance warnings; these are retained separately from exceptions. See the [repair evidence](stock-widget-repair.md).

The actual range checks matched 1M → **Past month**, 3M → **Past quarter** (three months) and 1Y → **Past year** on both screen sizes. [Three-month view](stock-market-quarter-desktop.png).

## Next steps

1. Try the embedded Realty Income chart in Preview and compare its layout with your recorded holding. Confirm whether the 1M/3M/1Y controls and chart size provide enough context.
2. If chart display is sufficient, keep this keyless option and apply the agreed UI to saved dividend accounts after feedback. Check each recorded exchange/listing rather than guessing a ticker from its company name.
3. If Drip should automatically value holdings or draw a fully custom chart, first select an affordable API plan/agreement that permits Drip's actual audience. Then generate a key in that provider's dashboard and add it as a **server-only Preview** secret using the agreed destination. Never use `NEXT_PUBLIC_*`, commit a key or paste it into chat. No API key or paid subscription is needed for the current widget sample.
4. For a genuinely owner-only Massive Basic experiment, the owner can [create a free account](https://massive.com/dashboard/signup) and obtain its dashboard key following the [official quickstart](https://massive.com/docs/rest/quickstart). That personal key would not authorize showing API-derived prices to other Drip testers; do not add it to the shared Preview under that assumption.
