# Saved Accounts design

The approved prototype now uses Drip’s real encrypted accounts, identity and settings. A new user sees an empty account list; no sample accounts are installed.

## What changed and why

- **Money, credit-card debt and net position:** separate figures prevent a credit balance or APR being mistaken for savings or income. Existing historical charts continue to measure assets.
- **Independent records:** multiple holdings and credit cards keep their own IDs, figures, colours and dates. Credit-card minimums and planned payments are separate statement/user entries; a plan never makes a payment or reduces debt.
- **Initials → Profile & settings:** the real gamertag, account counts, security/device settings, reminders and sign-out are accessible here. The monthly/yearly income preference is saved for this identity on this device.
- **Supported stock card → price view:** opening a card selects its public ticker. TradingView is a separate display chart; it may be delayed and does not populate the price field. Explicitly entering a USD price uses dated Frankfurter FX to save a GBP estimate. Shares, purchase cost and recorded dividend-income assumptions remain separate.
- **Safe updates and saves:** financial actions wait for encrypted storage. Canonical mutations preserve other tabs’ committed records; stale full-record edits and payout removals fail visibly. Updates and sign-out are disabled while relevant saves are pending.

Implementation: [app integration](../../../app/Drip.tsx), [credit terms](../../../lib/credit-card.ts), [valuation](../../../lib/market-valuation.ts), [encrypted storage](../../../lib/db.ts), [real profile](../../../app/accounts/ProfileSettings.tsx).

## Screenshot comparison

Actual optimized saved app, code commit `d9ecc78f836c3002ff0bf63c9c5e4225d4f70f9a`. [Capture/build/source-hash manifest](verification.json) contains27 states at1440×1000,390×844 and320×812. All identities/figures are synthetic; no passwords/recovery codes are shown. FX0.75 and chart transport are explicit fixtures. Full-page figures can compose a fixed tab bar over scroll content; a separate live bounding-box check confirmed the focused payment input stays above it.

| State | Mobile390 | Desktop1440 | Narrow320 |
| --- | --- | --- | --- |
| Sign in | [View](sign-in-mobile.png) | [View](sign-in-desktop.png) | [View](sign-in-narrow.png) |
| Sign up | [View](sign-up-mobile.png) | [View](sign-up-desktop.png) | [View](sign-up-narrow.png) |
| Empty accounts | [View](empty-accounts-mobile.png) | [View](empty-accounts-desktop.png) | [View](empty-accounts-narrow.png) |
| Saved accounts | [View](saved-accounts-mobile.png) | [View](saved-accounts-desktop.png) | [View](saved-accounts-narrow.png) |
| Profile & settings | [View](profile-settings-mobile.png) | [View](profile-settings-desktop.png) | [View](profile-settings-narrow.png) |
| Stock overview (chart hidden) | [View](stock-overview-mobile.png) | [View](stock-overview-desktop.png) | [View](stock-overview-narrow.png) |
| Saved stock value | [View](saved-stock-value-mobile.png) | [View](saved-stock-value-desktop.png) | [View](saved-stock-value-narrow.png) |
| Credit-card details | [View](credit-card-mobile.png) | [View](credit-card-desktop.png) | [View](credit-card-narrow.png) |
| Credit-card editor | [View](edit-credit-card-mobile.png) | [View](edit-credit-card-desktop.png) | [View](edit-credit-card-narrow.png) |

The earlier [approved prototype evidence](../first-impression/profile-settings.md) remains a design comparison, not proof that its memory-only records were saved.

## Verification

| Behaviour | Expected result | Executable evidence |
| --- | --- | --- |
| Multiple credit cards | Saving/editing one keeps the other unchanged; debt never becomes income | [domain](../../../tests/saved-experience.test.ts), [saved app browser](../../../e2e/saved-experience.e2e.spec.ts) |
| Stock price estimate | One value changes; shares, cost, recorded income and other holdings remain | [valuation/domain](../../../tests/saved-experience.test.ts), [real UI/storage](../../../tests/saved-experience.integration.test.tsx), [browser](../../../e2e/saved-experience.e2e.spec.ts) |
| Encrypted save/recovery | Original financial records and recovery metadata survive backup, reload and fresh-device restore | [real IndexedDB/WebCrypto](../../../tests/saved-experience.integration.test.tsx), [real HTTP/Postgres](../../../integration/saved-experience-http.integration.test.ts) |
| Older clients | The frozen original DB2 client cannot erase new records before sync or finish an older pending save | [frozen compatibility cases](../../../tests/saved-experience.integration.test.tsx) and [fixture provenance](../../../tests/fixtures/pre-debt-client/SOURCE.json) |
| Profile and sign-out | Identity-scoped preference survives reload; actual settings/sign-out work; pending saves remain guarded | [saved UI/browser](../../../e2e/saved-experience.e2e.spec.ts), [sign-out tests](../../../tests/device-session-ui.test.tsx) |
| PWA update | Same-origin old→new update retains ciphertext, supports the new records and reopens offline | [two-build journey](../../../e2e/pwa-update.spec.ts), [delayed-activation guard](../../../tests/pwa.test.tsx) |

The new primary suite targets 28 unit /8 integration (including real PostgreSQL) /4 browser cases, the requested70/20/10 split. Inherited integration-heavy coverage stays classified honestly. Run the complete regression entry point from [the app regression standard](../../testing/regression-policy.md); no new conditional exemptions or lowered thresholds are introduced.

Complete local regression: **856 passing cases** (230unit,521integration,34Postgres,71browser), plus an actual two-build PWA journey passing separately. The three inherited previous-build cases remain conditional in the standard report; one is now separately proven by the actual old→new run, while the two other historical fixtures remain unverified. Overall coverage:96.11% lines,90.80% branches,91.96% functions,92.80% statements. Audit0 vulnerabilities; types/build/boundaries pass. Current-head CI and hosted Preview outcomes are recorded in the PR before readiness. Screenshots do not prove current market prices or a physical iPhone installation.

## Compatibility and limits

Debt/valuation copies use encrypted format3; older asset-only copies remain1/2. The local DB version increases to3 without dropping its existing key-value store or ciphertext. Older compiled clients fail closed; reopen/reload the latest app rather than clearing site data. An old client cannot gain newly implemented update/edit guards retroactively, and unsaved text in an old tab is not a committed record. Downgrading to a DB2-only client is not a supported data-reader rollback.

No SQL migration, Production account access, new auth scheme, paid quote API or financial-provider connection is part of this change. Actual phone notification delivery, physical biometric/install behaviour and automatic live quotes are separate verification boundaries. The feedback-service prototype remains a proposed integration; no fake submission confirmation is added to the saved app.

## Transfer regression repair

The original screenshot build remains recorded above. A subsequent review found that a transfer after applying a stock price could discard the recorded income basis. The [repair and regression evidence](../../testing/valuation-transfers.md) explains the correction, including clearing income when a holding is fully withdrawn; the primary feature suite now contains33 unit,8 integration and4 browser cases (approximately73/18/9). This does not relabel the previously completed856-test baseline run as a new run.

## Next steps

1. Complete the real hosted Preview journeys using a task-owned synthetic user; local regression, screenshots and the actual mainba88e239→candidate update/offline journey have passed.
2. Obtain the independent current-commit Nexus verdict and all current-head checks before the owner-approved protected merge.
3. Verify main CI and its exact Git deployment, then prepare Nicole’s unsent release email using the stable app URL. Keep existing sign-in and saved data; do not tell her to create another account or reinstall.
