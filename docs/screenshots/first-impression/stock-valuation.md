# Stock-card chart and value preview

Open **Your accounts → Realty Income** at [`/prototype/welcome`](https://drip-git-prototype-first-impression-devonte-amos-projects.vercel.app/prototype/welcome). The delayed TradingView chart opens with the card. Try **1M**, **3M** and **1Y**. On a phone, scroll within the detail view to the holding figures.

Enter **Current price per share (USD)** and choose **Update demo value**. Drip gets a dated Frankfurter exchange rate, calculates the holding's estimated GBP value and applies it to the sample card, Money and net position. **Use recorded value** restores £2,500. **Reset demo** clears the temporary scenario.

**The chart displays actual provider data; the valuation uses the price you enter.** Automatic stock-quote import is not connected. A $60 entry in screenshots is an illustrative scenario, not a claim about Realty Income's current price. Demo changes stay in memory and do not modify saved accounts.

## Decisions and reasons

| Choice | Reason and implementation |
| --- | --- |
| Load on opening the stock | Removes the separate Explore/Load steps. The chart remains lazy until a stock is opened; Hide, Back and the external fallback remain available. [Card actions](../../../app/prototype/welcome/AccountPreview.tsx), [chart view](../../../app/prototype/welcome/StockPricePreview.tsx). |
| Keep the two data sources explicit | TradingView's free widget supports chart display; it does not provide Drip a raw quote API. No iframe reading or traffic scraping is used. [Provider comparison](stock-prices.md), [TradingView data FAQ](https://www.tradingview.com/widget-docs/faq/data/). |
| Convert in the correct direction | `shares × entered USD price × USD→GBP reference rate`. Fractional precision is retained until currency formatting. With 50 shares, $60 and an illustrative 0.75 rate, value is £2,250. [Pure calculation](../../../app/prototype/welcome/stock-valuation.ts). |
| Show value and capital return separately from income | Cost remains `50 × £48 = £2,400`. In that example capital return is -£150/-6.25%. £135 annual stock income, £340 combined annual income and £0 received do not change with price. The fixed 5.40% is labelled **Recorded dividend yield**. |
| Update the overview visibly | The sample's £5,000 cash is added to the stock estimate; £1,200 recorded card debt is subtracted for net position. Cards and overview identify estimated values; the £2,500 recorded baseline remains recoverable. |
| Bound FX to the current UTC day | Frankfurter V2 default “latest” may include next-day publications. The documented date lookup carries prior observations forward while retaining their real dates. Drip still rejects future, wrong-currency, malformed or over-seven-day-old observations. [Server boundary](../../../server/exchange-rates.ts), [provider changelog](https://github.com/lineofflight/frankfurter/blob/main/CHANGELOG.md), [provider query implementation](https://github.com/lineofflight/frankfurter/blob/main/lib/versions/v2/rate_query.rb). |
| Keep errors reversible | Unavailable FX never substitutes a guessed rate. Editing, closing or replacing a pending request aborts it; late results cannot apply an old price. [Price-entry component](../../../app/prototype/welcome/StockValuePreview.tsx). |

## Screenshots

Captured from the actual Git Preview at source **`9c7c2e35a6197c8476aea4124e6c6b1e30b3b85d`**, 7 November 2026: desktop 1440×1000, mobile 390×844 and a 320×812 narrow check. All recorded holdings and the $60 entered price are synthetic; the chart and dated FX are actual provider responses. Screenshots show observations at capture time, not current quotes. Images were opened and visually inspected.

| State | Mobile | Desktop |
| --- | --- | --- |
| Stock opened; chart loaded | [Chart with attribution](stock-value-chart-mobile.png) | [Chart and holding](stock-value-chart-desktop.png) |
| Entered price applied | [Value, input and FX](stock-value-mobile.png) | [Chart and new value](stock-value-desktop.png) |
| Calculation and original figures after scrolling | [Cost and income](stock-value-calculation-mobile.png) | [Calculation and figures](stock-value-calculation-desktop.png) |
| Accounts after applying the estimate | [Updated card and totals](stock-value-accounts-mobile.png) | [Updated card and totals](stock-value-accounts-desktop.png) |

[320px Accounts capture](stock-value-accounts-narrow.png). The original first-impression comparison section remains unchanged in the [screenshot index](README.md#screenshots).

## Verification

The new valuation suite contains **7 unit / 2 integration / 1 browser case**, exactly 70/20/10. The existing chart suite remains 7/2/1 and now checks automatic loading. The FX compatibility regression failed against the old unbounded request and passes with the dated lookup; future-observation rejection and the genuine earlier observation date are preserved.

| Behaviour | Expected result | Evidence / status |
| --- | --- | --- |
| Calculation and input boundaries | Correct fractional FX, cost-based gains/losses, zero-cost percentage handling, rejected ambiguous/unsafe values and immutable records. | [Seven isolated units](../../../tests/stock-valuation.test.ts); 34 focused cases passed including existing stock/FX flows. |
| Component interactions | Values and totals update, income/cost stay fixed, clear/reset work, invalid/stale/provider/aborted responses cannot apply. | [Two real React integrations](../../../tests/stock-valuation.integration.test.tsx), no primary datastore for this memory-only prototype. |
| Critical browser workflow | Open card → chart starts → enter price → apply dated FX → return to updated Accounts → restore recorded value. | [One Chromium journey](../../../e2e/stock-valuation.e2e.spec.ts); deterministic external transport fixtures, not live-price evidence. |
| Actual hosted sources and layout | Correct delayed chart, real current-day-bounded FX, exact value/totals, preserved income, no overflow or page exceptions on mobile/desktop. | Real Git Preview source `9c7c2e3`, deployment `dpl_4vopdrjJnFLNrCEUeYuTRke1gok6`, Chromium156. All three widths passed: actual NYSE:O canvases, all periods, Frankfurter0.74404 dated2026-11-07; $60×50 → £2,232.12, Money£7,232.12, net£6,032.12, preserved cash income. [Machine-readable receipt](stock-valuation-verification.json). |
| Full app regressions and checks | Complete suite, unchanged thresholds, audit, types, boundaries, build and exact-head Git checks. | Local complete suite passed **794 unique cases** on source `9c7c2e3`: 188 unit, 508 component/storage integration, 33 real Postgres/HTTP and 65 browser. Types, boundaries, build and audit passed; source-head CI, architecture (LOW/no material findings) and Vercel checks passed. Documentation-head checks must also pass before handoff. Three inherited old-build PWA journeys remain conditional. |

Hosted verification found zero page/CDP exceptions and no horizontal overflow; Web Locks remained denied. One TradingView embed navigation failure was recorded per viewport while changing ranges; the capture did not retain an error code, so its cause is unverified. Final charts, every range and the actual FX/value flow worked. Provider preload warnings are retained separately. This is not a claim of a warning-free network, independent quote accuracy, hosted account authentication or physical iPhone/PWA testing.

Nexus Architect approved the exact-source code review after the recorded-yield and signed-loss corrections. Canvas independently approved prototype-feedback handoff after inspecting desktop, mobile and narrow captures, including the improved panel-heading frames; actual verdicts are recorded with the PR. Neither verdict authorizes a merge or configures automatic quotes.

## Next steps

1. Try a share price in Preview and give feedback on the chart-first flow, value labels and return display. Use **Use recorded value** to compare the original card.
2. For automatic valuation, choose a raw quote feed with the intended shared-user entitlement. No configured free feed has been verified yet. [Marketstack Basic/Starter](https://marketstack.com/pricing/) is a low-cost lead at $9.99/month; its free card is explicitly non-commercial. Exact shared display/derived valuation scope still needs confirmation. No subscription has been bought.
3. Once a provider is selected, generate its key in the provider dashboard and configure it **server-side for Drip Preview only** through the established secret workflow. Do not paste keys in chat, commit them, or use `NEXT_PUBLIC_*`. The chart and entered-price preview need no stock-feed key.
4. Add the selected server quote adapter: allowlisted listing, currency/source/market timestamp, delayed/EOD label, bounded requests and response validation, shared cache and quota-aware refresh. Preserve recorded fallback and fixed dividend cash. Verify real success, stale/quota/entitlement failures and the complete hosted journey before claiming automatic pricing.
5. This remains prototype feedback. Applying the agreed design to saved accounts and releasing it are separate work; no merge or Production action is included here.
