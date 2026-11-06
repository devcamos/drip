Source: `7b9aa66356a0e7d62ecd33e0359fb9963789e082`, complete local `npm run test:regression`, 6 November 2026. Optimized app, real disposable Postgres/HTTP and Chromium. Feature rows can reuse cases; only the layer totals represent unique cases. See the separate [real-provider verification](stock-prices.md#verification).

# Drip regression report

Counts are executed test cases. Conditional/skipped journeys are unverified, not passes. Legacy distribution is reported honestly; new feature pyramids enforce the 70/20/10 target (±5 percentage points).

| Layer | Passed | Failed | Conditional |
| --- | ---: | ---: | ---: |
| unit | 180 | 0 | 0 |
| integration | 506 | 0 | 0 |
| postgres | 33 | 0 | 0 |
| browser | 64 | 0 | 3 |

| Feature | Result | Passed | Conditional |
| --- | --- | ---: | ---: |
| Gamertag signup, password login and session policies | PASS | 111 | 0 |
| Original six recovery codes, reset and file recovery | PASS | 90 | 0 |
| Encrypted local storage, account switching and locked-state safety | PASS | 44 | 0 |
| Encrypted cloud sync, conflicts, version compatibility and restored data | PASS | 123 | 0 |
| Four-device admission, targeted revocation and signout races | PASS | 70 | 0 |
| Passkey registration/unlock and recovery alternatives | PASS | 25 | 0 |
| Account editing, providers, categories and colours | PASS | 30 | 0 |
| Balances, topups, withdrawals, rate changes and income arithmetic | PARTIAL | 52 | 1 |
| Dividend portfolio and received-income totals | PASS | 25 | 0 |
| Shares, acquisition cost, valuation and yield | PASS | 12 | 0 |
| Daily FX estimates and bounded upstream API failures | PASS | 16 | 0 |
| Trends, forecasts and deposit assumptions | PASS | 29 | 0 |
| Expected payments, recurrence and reminders | PASS | 40 | 0 |
| Phone-reminder enrolment, scheduling, limits and dispatch | PASS | 56 | 0 |
| Install task, offline shell, safe worker updates and data retention | PARTIAL | 35 | 2 |
| Design prototypes and Preview-only routes | PASS | 56 | 0 |
| Deployment configuration and database schema compatibility | PARTIAL | 40 | 1 |
| App navigation, identity and screen orchestration | PASS | 45 | 0 |
| Regression catalog, change evidence and test-control guards | PASS | 23 | 0 |
| Credit-card debt prototype and statement repayment planning | PASS | 20 | 0 |
| Optional dividend price-history chart and recorded holding separation | PASS | 10 | 0 |

## Conditional journeys

- e2e/income-update.spec.ts: actual main worker3 upgrades to worker4 on a stable origin without changing encrypted accounts
- e2e/pwa-update.spec.ts: saved bookmark updates from the old worker, refreshes imported build identity, and retains encrypted accounts offline
- e2e/signin-update.spec.ts: a saved password and encrypted records survive an old-to-new build update while signed out

## Evidence errors

None.
