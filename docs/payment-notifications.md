# Payment notifications

The Portfolio tab totals actual dividend receipts for current dividend holdings.
Estimates use saved balances and annual yields, and are labelled separately.
The bell and Settings open payment reminders for all earning cash and dividend
accounts. Logging income never automatically changes an account balance.

Phone notifications require explicit per-device permission and an installed
Home Screen app on iPhone/iPad. Lock-screen messages contain no account names,
balances or amounts. Payment dates/frequencies and time zone are stored beside
an AES-GCM-encrypted browser push address; the financial vault is unchanged.
Notifications can continue while signed out. Turn them off in Drip or device
settings. Changes on another device reach a reminder schedule after that device
syncs and opens Drip. Delivery depends on the browser, network and push provider.

## Deployment setup (requires approval, Preview first)

Apply `scripts/payment-notifications.sql` to the isolated Preview database using
the existing approved migration workflow. It creates one additive table with a
user FK; it does not modify password, recovery, vault or session schemas.

In the existing Drip Vercel project, configure only the approved environment:

- `DRIP_PUSH_PUBLIC_KEY` / `DRIP_PUSH_PRIVATE_KEY`: matching P-256 VAPID pair.
- `DRIP_PUSH_STORAGE_KEY`: separate random 32-byte base64url encryption key.
- `CRON_SECRET`: random bearer secret, at least32characters.

Do not regenerate the storage key during routine builds: existing subscriptions
need the same key. Keep private values server-only and out of logs/source. Base
`DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` remain required per the
existing branch deployment preflight. No paid plan change is needed.

Vercel Cron calls `/api/notifications/dispatch` once a day at09UTC, with Hobby
precision within that hour. It runs automatically on Production only. A Preview
test must invoke that endpoint manually with its scoped bearer secret, after
explicit setup approval. Use an opted-in synthetic device; do not notify users
as a test. `Send test notification` is authenticated and limited to once/minute.
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
