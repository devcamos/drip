# Stock widget: resolving the Preview blocker

The advanced chart rendered prices but raised two uncaught provider exceptions when the browser denied third-party cross-tab locking. A rendered chart alone was insufficient evidence of a clean integration.

**Use the official [Symbol Overview](https://www.tradingview.com/widget-docs/widgets/charts/symbol-overview/) widget.** It fits the task: quote, selected-period price change and history. It works with the same iframe sandbox, no-referrer policy and denied Web Locks. No API key, paid plan, extra browser permission or provider-code patch is needed.

## Why this fix

| Approach tested | Observed result |
| --- | --- |
| Advanced Chart, restricted HTTPS embedding | Real plot, two SecurityErrors |
| Anonymous Advanced Chart | Same two exceptions |
| Removing sandbox in a disposable diagnostic | Lock access still denied; not a fix |
| Symbol Overview with original protections | Real quote/history, zero page exceptions |
| Mini Chart | Also passed, but gave less clear period-performance context |

The published repair changes the widget selection, its documented settings and attribution text size. Recorded shares, GBP value, cost, dividend yield and income remain separate from the USD market view.

## Verification

- New contract assertions failed against the old helper: four failing cases. All nine focused unit/component cases pass after the repair.
- The complete regression run passed 783 unique cases with unchanged coverage thresholds. [Executed report](regression-report.md). The new stock feature remains 7 unit/2 integration/1 browser, or 70/20/10.
- Actual hosted source `7b9aa66356a0e7d62ecd33e0359fb9963789e082` passed at 390×844 and 1440×1000: real plot, correct identity, zero page exceptions, zero failed requests and no horizontal overflow. HTTPS and denied Web Locks were explicitly checked.
- Every range was tested against the provider's actual period: 1M **Past month**, 3M **Past quarter**, 1Y **Past year**. The early harness expected the literal phrase “Past 3 months”; observing the real three-month plot corrected that terminology assumption. Exception checks remained intact.
- Provider preload warnings remain visible in diagnostics. Zero exceptions does not mean a warning-free console, independent quote accuracy or physical-iPhone validation.

See the [actual hosted screenshots](stock-prices.md#screenshots). They contain real delayed market data and synthetic holding figures. Prices differ between capture times.

## Next steps

Use the same secure-context, restricted-storage smoke check whenever the embedded component changes. Keep the standalone chart fallback. Apply the agreed design to saved holdings after prototype feedback; automatic valuations still require a suitable raw-data API.
