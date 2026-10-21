# Scrollable account wallet

21 October 2026. Application source `e96bbe0` (the wallet implementation commit).
Actual optimized local application, Chromium / Pixel 7 emulation, synthetic
`wallet_demo` with eight savings/investment accounts. Mobile **390 × 1000** and
desktop **1280 × 1000**, actual viewport captures. All four images were opened
and visually inspected; no UI mocks, masking, secrets or customer data.

| State | Mobile | Desktop |
| --- | --- | --- |
| Top of the overlapping stack | [View](mobile-start.png) | [View](desktop-start.png) |
| Final holdings, reached by keyboard | [View](mobile-end.png) | [View](desktop-end.png) |

The account wallet now sits immediately below the total balance. Cards overlap
inside a bounded vertical scroller, with native touch/wheel input and proximity
snapping. Empty card footers reserve room for the overlap; names, balances,
categories, yields and income estimates remain uncovered by the next card.
The visible count and hint make the additional cards discoverable. Recorded
income and upcoming payments remain below the wallet in the page.

`e2e/account-wallet.spec.ts` passed against the running build. It verifies:

- Eight accounts overflow the wallet, while the page fits 320/390/1280 px widths.
- The next card starts below each preceding card's content at all three widths.
- Tabbing through all cards brings the final holding fully into view, with a
  visible focus outline; keyboard activation opens the first account correctly.
- Mouse-wheel input and emulated touch-drag events independently move the native
  scroller. Tapping the final holding opens its correct name and £2,750 balance.

Keyboard browsing is tested before touch gestures so synthetic touch momentum
does not race the keyboard focus checks. Physical iPhone/Safari and Android
installation/gesture behavior are not claimed from Chromium emulation.

The existing account-options browser journey also passed on this application,
including encrypted reload and file-backup restoration. Related component tests
passed **40/40**; optimized build/typecheck passed. Final current-head CI results
are linked from [PR23](https://github.com/devcamos/drip/pull/23). Calculations,
stored data, encryption and account order are unchanged by the wallet layout.

[Before: separated account cards](../account-options/README.md), captured from
the preceding account-options source. To capture this implementation again,
serve its optimized build on localhost:4321, then run separately from other
Playwright invocations:

```sh
PW_CHROME=/usr/bin/chromium DRIP_WALLET_CAPTURE=1 \
  npm exec -- playwright test e2e/account-wallet.spec.ts --workers=1
```

Localhost is test infrastructure, not a user-accessible Preview. The existing
hosted Preview backend authorization/validation blocker remains separate;
no credentials were transferred and no Production release was performed.
