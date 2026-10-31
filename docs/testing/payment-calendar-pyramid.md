# Payment calendar test pyramid

This suite covers Drip's twelve-month expected-payment calendar. The split is
by independently executable test cases, not test files or assertions:

| Layer | Cases | Share | File | Real boundaries |
| --- | ---: | ---: | --- | --- |
| Unit | 14 | 70% | [`payment-calendar.test.ts`](../../tests/payment-calendar.test.ts) | Pure domain calculation; fixed clock; no DOM, datastore, network or filesystem setup |
| Integration | 4 | 20% | [`payment-calendar.integration.test.tsx`](../../tests/payment-calendar.integration.test.tsx) | Actual editor, calendar, repository, IndexedDB transactions and Web Crypto |
| E2E | 2 | 10% | [`payment-calendar.e2e.spec.ts`](../../e2e/payment-calendar.e2e.spec.ts) | Running production build, Chromium, actual browser IndexedDB and encryption |

This is a feature-scoped ratio. Drip's existing application-wide tests are
retained; this does not claim that the entire app now has this distribution.

## Unit coverage

Fourteen domain cases cover monthly/quarterly/yearly recurrence, partial rolling
windows and inclusive/exclusive bounds, leap days, recovery from month-end date
clamping, daily grouping and future starts, invalid/overflow dates, non-earning
or non-finite data, empty results, deterministic ordering, penny rounding,
schedule edits, exclusion of bonuses/compounding and immutable income records.
Expected dates and amounts are explicit, independent examples rather than
calculated by calling the production helper again.

`vitest.calendar.config.mts` gives this layer a Node-only project with no
application-wide DOM/IndexedDB setup. The clock is faked and all data is static.
The code has no external I/O to mock; its own domain collaborators run normally.
Per-case domain execution takes milliseconds; runner startup is separate.

## Integration coverage

All four cases persist data through the actual encrypted repository. They
verify rendering/navigation, editor → encrypted save → recalculated calendar,
vault lock/unlock with unchanged received income and empty/invalid view states
that preserve the stored records. At-rest assertions check ciphertext and
compare records before/after readonly operations.

The primary datastore for this feature is browser IndexedDB. `fake-indexeddb`
provides its in-memory implementation, including transactions; repository
methods and cryptography are not mocked. `node:crypto` supplies real Web Crypto
in the DOM test environment. Each case starts with a fresh database. Only the
navigation callback is observed with a spy. There is no calendar HTTP/SQL API,
so no unrelated server or Postgres service is added just to fill a layer.

## Browser coverage

Only two critical user workflows run in Playwright:

1. An existing user opens upcoming cash/dividend payments, selects a holding and
   sees the existing received-income total.
2. A user changes a payment date/frequency, reloads, unlocks the real encrypted
   vault and sees the saved future schedule with unchanged balances/income.

The existing-account fixture seeds synthetic local records and performs the
actual legacy encryption step. It does not cover signup, hosted account login,
cloud persistence or phone delivery; those have separate suites. No API response
mocks are used. Date is fixed, while UI timers and cryptography run normally.
Date edge cases and input permutations stay in unit/integration tests.

## Run

After the normal `npm ci` and Playwright browser setup:

```sh
npm run test:calendar:unit
npm run test:calendar:integration
npm run build
npm run test:calendar:e2e
```

Or, with a production build already available:

```sh
npm run test:calendar
```

The browser config starts its own local server on port 4321. Set `PW_CHROME` if
using a system Chromium. No cloud credentials, database service or Production
access is needed. Unit/integration cases also run in the existing `npm test`
coverage job, and both browser journeys run in `npm run e2e`. Existing coverage
thresholds and assertions remain enforced.

For optional screenshot evidence, set `DRIP_CALENDAR_CAPTURE` to an output
directory. The browser journeys capture only synthetic calendar panels at
mobile/desktop sizes. Existing 320/390/1280px overflow assertions run even when
screenshot capture is disabled; layout needs an actual browser.
