# Payment notifications

The Portfolio tab totals actual dividend receipts for current dividend holdings.
Estimates use saved balances and annual yields, and are labelled separately.
The bell and Settings open payment reminders for all earning cash and dividend
accounts. Logging income never automatically changes an account balance.

The bell also includes a [twelve-month expected payment calendar](payment-calendar.md),
derived from each earning account's next date and frequency. Daily payments are
grouped by month; editing a schedule recalculates future dates without adding
received income. [Calendar screenshots](screenshots/payment-calendar/README.md).

Phone notifications require explicit per-device permission and an installed
Home Screen app on iPhone/iPad. Lock-screen messages contain no account names,
balances or amounts. Payment dates/frequencies and time zone are stored beside
an AES-GCM-encrypted browser push address; the financial vault is unchanged.
Notifications can continue while signed out. Turn them off in Drip or device
settings. Changes on another device reach a reminder schedule after that device
syncs and opens Drip. Delivery depends on the browser, network and push provider.

## Deployment setup (requires approval, Preview first)

Apply `scripts/payment-notifications.sql` to the isolated Preview database using
the existing approved migration workflow. It creates two additive notification
tables with user FKs; it does not modify password, recovery, vault or session schemas.

In the existing Drip Vercel project, configure only the approved environment:

- `DRIP_PUSH_PUBLIC_KEY` / `DRIP_PUSH_PRIVATE_KEY`: matching P-256 VAPID pair.
- `DRIP_PUSH_STORAGE_KEY`: separate random 32-byte base64url encryption key.
- `CRON_SECRET`: random bearer secret, at least32characters.

Do not regenerate the storage key during routine builds: existing subscriptions
need the same key. Keep private values server-only and out of logs/source.
`DATABASE_URL` and `BETTER_AUTH_SECRET` remain required. Preview can derive a
missing `BETTER_AUTH_URL` from its stable `VERCEL_BRANCH_URL`; Production and
local runs require an explicit auth origin. No paid plan change is needed.

Vercel Cron calls `/api/notifications/dispatch` once a day at09UTC, with Hobby
precision within that hour. It runs automatically on Production only. A Preview
test must invoke that endpoint manually with its scoped bearer secret, after
explicit setup approval. Use an opted-in synthetic device; do not notify users
as a test. `Send test notification` is authenticated and limited to one per60seconds
across that Drip user's devices. Schedule updates share a60-update,60-second
window per user, alongside the existing device limit. These owner/action budgets
survive enrollment deletion, expiry and device/address changes. Limiter storage
is bounded to two small rows per user and is removed with that user.
Successful provider acceptance alone does not prove a phone displayed it.

## Verification

`npm test` retains global85% and logic90/85 coverage gates. Run
`npm run test:integration` against an ephemeral Postgres18 database named
`drip_notifications_test` on loopback (defaultport55438; override only with
`DRIP_TEST_DATABASE_URL`). It creates and removes a unique test schema and
refuses non-loopback or differently named databases. CI supplies its own service.

`npm run e2e` includes the new income/reminders test. For isolated local capture,
`npx playwright test --config playwright.income.config.ts` uses port4329;
`DRIP_UI_CAPTURE` optionally selects a synthetic screenshot directory. No real
account credentials, browser permission or push-provider delivery are mocked as
proof of real-device delivery. Old-to-new worker4 offline update evidence is
required before marking this PR ready.

## API validation evidence

Notification handlers share an authenticated context and strict schemas. The
architecture review's ARCH-003 warning should be checked against this full path:

| Incoming input | Validation before persistence/delivery | Regression coverage |
| --- | --- | --- |
| Subscription PUT body | JSON content type; advertised and streamed64KB bounds; strict `registrationSchema.safeParse` before `store.save` | malformed/oversized JSON; invalid schemas; no save on rejection |
| Endpoint and transport keys | HTTPS push-provider allowlist; no credentials/port/fragment; canonical base64url and P-256 point validation | SSRF/private hosts; wrong key sizes; invalid point/padding |
| Schedule | strict date/frequency/time-zone schema, max500plans; unknown fields rejected | impossible dates/zones, oversized plan lists, financial-field rejection |
| Owner/device headers | session user must match owner; UUIDv4 device; same-origin writes | unauthenticated, other-owner, bad-device and cross-origin rejection |
| Cron Authorization | configured bearer with length check and constant-time comparison | absent/incorrect/extended bearer rejected |
| Test notification | own enrolled device; per-minute rate limit; fixed generic payload | missing/expired enrollment, rate limiting, no raw secret/error logs |

Sources: [API](../server/notifications/api.ts),
[schemas](../server/notifications/model.ts),
[security tests](../tests/notifications-security.test.ts),
[real database tests](../integration/notifications-postgres.test.ts).
GET/DELETE/test routes consume no client body or financial query parameters.
The dispatch loop intentionally waits for each bounded batch: leases and the
runtime budget must be checked before requesting the next page. Body reads are
sequential to enforce limits with backpressure. The old-to-new deployment test
is opt-in because it needs two actual builds on a coordinated stable origin;
it has been executed locally, not replaced with a skipped-test success claim.
