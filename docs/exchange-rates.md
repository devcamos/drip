# Daily GBP currency estimates

Drip uses Frankfurter's public v2 **blended** daily reference rates for USD→GBP
and EUR→GBP. No provider account, API key, subscription or new environment
variable is required. This does not provide share prices.

On a dividend holding with shares and a USD/EUR original price, open
**Your investment → Convert a share price to GBP**. Enter the latest price per
share from your provider, then choose **Convert to GBP**. The browser calculates
`entered price × GBP per currency unit × shares`, with fractional shares intact.
The result displays the source and provider's rate date. It is an estimate,
not an executable broker quote, and fees/spreads may differ.

Recorded balance, GBP acquisition cost, payouts, snapshots and dividend yield/
forecast assumptions stay unchanged. Use the existing Update balance action
to record a new value. Today's FX is never substituted for historic purchase
cost. Changing the price or shares recalculates locally; changing the selected
holding/currency cancels pending work and clears the transient estimate.

## Data handling and failures

- The browser requests only `/api/exchange-rates?base=USD` or `base=EUR` after
  explicit conversion. Same-origin cookies support protected Previews; the
  server never forwards them upstream. Price, quantity, account IDs, gamertags
  and balances are not included in the rate request.
- The server uses a fixed HTTPS Frankfurter URL, no incoming credentials or
  headers, no redirect following, a five-second timeout, a 16 KiB response-read
  limit and validation of the exact pair, positive finite rate and calendar date.
- Dates in the future or more than seven UTC calendar days old are rejected.
  Daily references may span weekends and holidays; the visible date is always
  the provider's date, not the time of an HTTP fetch. There is no intraday/live
  price claim or background polling.
- Validated public rates use public response caching
  (`max-age=300, s-maxage=3600`); unvalidated upstream bodies are not cached.
  Cache/cold-start behavior depends on the host;
  this is not a guaranteed global request quota or SLA. No private data is
  cached, and the existing service worker continues excluding APIs.
- Invalid requests return 400; upstream/validation failures return a generic
  non-cacheable 503 and a sanitized provider/currency diagnostic. A failed
  refresh retains an already loaded, still-usable dated rate with a visible
  warning. Without a usable rate, no estimate is shown and manual tracking works.
- Estimates and entered current prices are transient. They are not persisted or
  exported; existing encrypted data formats and recovery flows are unchanged.

Frankfurter's FAQ explicitly permits commercial use of its blended rates and
encourages caching. Direct provider-specific endpoints can have different terms;
Drip does not select those endpoints. The free service has abuse rate limits and
no daily/monthly quota; it has no guaranteed availability for this app.

[Frankfurter documentation and FAQ](https://frankfurter.dev/).
Tests: `tests/exchange-rates.test.ts`, `tests/currency-estimate.test.tsx`,
`e2e/exchange-rates.spec.ts`. Deterministic UI screenshots use synthetic prices,
accounts and mocked public FX responses; an actual public feed/API check is
recorded separately in the Nexus operations evidence.
