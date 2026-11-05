# App-wide regression standard

Every application change must carry regression evidence and pass the existing
`test` CI job before merging. The complete local/CI entry point is:

```sh
npm run test:regression
```

It checks the feature catalog and Git diff, type checks, dependency boundaries,
all Vitest projects with coverage, a production build, local/offline Playwright
cases, fourteen required browser journeys backed by local Postgres, and the
resulting evidence report. CI also performs the security audit. There are
no path filters that let a source change bypass the suite.

## Feature inventory

[`tools/regression/catalog.json`](../../tools/regression/catalog.json) owns the
source files and executable regression evidence for every current area:

- Gamertag signup/password login and remembered sessions.
- Original six recovery codes, reset and encrypted file recovery.
- Encrypted local data, lock/unlock and account switching.
- Encrypted cloud sync, ownership, conflicts and format compatibility.
- Four-device admission, management and signout races.
- Passkey registration and unlock.
- Accounts, products, providers and colours.
- Balances, topups, withdrawals, rate changes and income calculations.
- Dividend portfolios and received income.
- Shares, acquisition cost, recorded valuation and yield.
- Daily currency conversion.
- Trends, forecasts and deposits.
- Payment calendars and in-app reminders.
- Phone-reminder enrolment, limits and dispatch.
- PWA installation, offline shell and safe updates.
- The holdings prototype.
- Deployment/schema compatibility.
- Shared navigation and screen orchestration.
- Regression tooling and CI configuration.

New application files must be mapped; referenced source/tests must exist. Every
test file must have one runner layer and at least one feature mapping. The
catalog does not manufacture test results: the report requires actual executed
results for every listed suite.

## Test layers

The target for new feature suites is **70% unit /20% integration /10% browser**,
measured using executed cases. The gate allows five percentage points around
each target so one meaningful new test need not cause filler tests in another
layer. A new feature needs an executable `pyramids` entry; the payment calendar's
14/4/2 suite is the first reference.

Legacy coverage is preserved and classified conservatively. It is currently
integration-heavy. UI rendering, actual crypto/storage and HTTP/library wiring
are not relabelled as pure units to obtain a prettier percentage. The report
shows the actual distribution separately from new-feature targets.

| Project | Purpose | Datastore/dependencies |
| --- | --- | --- |
| `unit` | Isolated domain/validation/control logic | Node-only; fixed clock; external I/O mocked; no global DOM/IndexedDB fixture |
| `integration` | Components, repository/storage, encryption and client/library interactions | Real in-memory IndexedDB/Web Crypto where used; some legacy UI tests isolate backend contracts with mocks |
| `postgres` | Actual API, auth, repository queries, locking and dispatch | Disposable loopback Postgres; primary datastore is not mocked |
| Playwright | Critical user journeys, rendering and local offline/update behavior | Running optimized app and actual browser storage; individual fixtures state any API simulation |

New integration coverage must exercise its primary datastore. Mocked UI
contracts alone do not establish that SQL/auth/cloud persistence works.
New-feature browser cases cover core workflows; date permutations and validation
edge cases belong in fast lower layers.

## Rules for each change

1. Update/add a mapped regression test for every affected application feature.
   Removing/renaming a module still needs evidence using the previous catalog.
   Documentation-only changes do not need meaningless test edits.
2. Put new test files in the appropriate catalog layer and feature. New features
   also need a primary pyramid; existing supporting regression checks remain.
3. Keep all quality thresholds: at least 85% overall, stricter 90% logic lines/
   functions/statements and 85% logic branches. Coverage now includes server code
   and the deployment-config utility as well as `app`/`lib`.
4. Do not focus a test or add skips, todos, expected failures or conditional
   exemptions. The 17 inherited conditional declarations are recorded by exact
   file/title and reason. Fourteen must execute in the local cloud stage; only
   three older-build fixtures remain conditional. Later changes cannot grow
   that exception list.
5. Require actual current-head passing results. Browser retries that only pass
   after failure are reported as flaky and fail the comprehensive run. Missing
   reporter files, unexecuted suites and unexpected runtime skips also fail.
6. Review the assertions: the automated evidence gate checks mapping and
   execution, while review checks that each new assertion protects the intended
   behavior. For a bug, demonstrate failure before the fix and success after it.

## Real account/data contracts

[`account-http.integration.test.ts`](../../integration/account-http.integration.test.ts)
uses loopback HTTP, Drip's actual auth/cloud/recovery route handlers, production
auth policies and real Postgres. Only the database/auth factory connection is
injected; it does not fake queries, sessions or route responses. It exercises
signup, gamertag/password login, encrypted investment restore, process restart,
session expiry, wrong credentials, owner isolation, concurrent version conflicts,
origin checks, immutable original recovery codes and password-reset revocation.

The native schema comes from the installed Better Auth version and application
SQL comes from the actual migration script, inside a random disposable schema.
These tests reject non-loopback hosts or a different database name. Postgres
files have serial schema lifecycles; request-level concurrency tests still run
concurrent operations. This removes cross-suite CREATE/DROP interference with
auth schema introspection without disabling schema checks or concurrency tests.

## Local setup

Use the normal `npm ci` and Playwright Chromium installation. A disposable
Postgres 18 example is:

```sh
docker run --rm -d --name drip-regression-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=drip_test \
  -e POSTGRES_DB=drip_notifications_test \
  -p 127.0.0.1:55438:5432 postgres:18-alpine
npm run test:regression
docker stop drip-regression-db
```

The default connection uses that loopback port/name. CI supplies
`DRIP_TEST_DATABASE_URL` on its service port 5432 and the exact comparison SHA in
`REGRESSION_BASE`; local runs default to `origin/main`. The runner refuses hosted
database targets and removes application cloud/push settings from its local
browser fixture. The cloud stage creates its own random schema, migrates the
installed auth/app schema, starts the real HTTP app using guarded local Postgres,
and drops that schema in cleanup. Its auth secret exists only in the process
environment. Production settings cannot enable this test transport. Limiters
stay enabled; independent scenarios reset their own synthetic limiter records.
It does not load or modify an environment file. No hosted SQL,
Production account, real user credentials or phone-alert configuration is needed.

Faster checks while building:

```sh
npm run test:unit
npm run test:components
npm run test:integration
npm run test:policy -- --base origin/main
```

## Reports and unverified boundaries

`regression-results/summary.md` and `summary.json` contain the executed counts,
per-feature PASS/PARTIAL/FAIL evidence, pyramid checks and conditional journeys.
CI uploads these alongside coverage/browser failure evidence, even on failure.
Skipped checks are never counted as passes. Local collection skips for the
fourteen cloud journeys are replaced only by actually executed passing results
from the separate cloud report. Missing, skipped or flaky cloud cases fail the
run. The three older-build fixtures remain explicitly unverified. Real
HTTP/Postgres contracts and current local browser checks are separately identified.

The always-on PWA case uses the real current app/worker and injects only a future
public fingerprint. It proves detection, explicit reload, retained encrypted
data, another open tab and offline reopening. It does not claim an older compiled
client transition or a physical iPhone/Android installation. Physical biometric
and phone-push receipt still require their own device/Preview evidence. No test
run guarantees the absence of defects outside its exercised behavior.

CI changes become active when the reviewed test change is merged. Preserve
GitHub protections and require the `test` check on main; do not use an admin
bypass. A test-policy change does not itself authorize merging or deploying.
