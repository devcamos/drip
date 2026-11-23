# Headless browser coverage

## What runs

The [regression catalogue](../../tools/regression/catalog.json) maps the complete Chromium suite to application features. `npm run test:regression` runs it against a local production build, then runs the 14 required cloud journeys against a disposable loopback Postgres database. Its report identifies the executed, conditional and missing journeys; test cases use synthetic identities and balances. The cloud stage does not use a hosted Preview or real user account.

| Critical area | Existing evidence | Additional mobile WebKit gate |
| --- | --- | --- |
| Sign-in, sign-up, recovery | `auth-screens`, `password-login`, `original-recovery` and real-database cloud journeys | `auth-screens` checks navigation, history and password clearing. |
| Accounts and dividend holdings | `saved-experience`, `account-wallet`, `stock-investment`, `rate-change` | `stock-investment` exercises editing, encrypted reload and backup restoration. `rate-change` edits a rate with an effective date and checks the rate history list. |
| Credit cards and payments | `account-workflows`, `saved-experience`, `payment-calendar` | `account-workflows` checks card reminders, paid statements and reload; `payment-calendar` opens an upcoming payment and its holding. |
| Feedback | `feedback` and real-Postgres feedback tests | `feedback` uses a synthetic identity and an intercepted response, with the service worker disabled to allow interception; it does not verify hosted submission or service-worker interaction. |
| Saved app and update | `pwa-current-update`, `worker-safety` | `pwa-current-update` checks the current shell, public fingerprint and offline encrypted data. |
| Cloud sync and devices | `recovery`, `four-device-signin`, `password-race` in disposable local Postgres | Chromium only; hosted and WebKit cloud flows remain gaps. |

The selected browser matrix is mobile Chromium (Pixel 7) for the complete catalog and mobile WebKit (iPhone 13 profile) for login/signup/recovery, saved-account editing, credit-card reminders, payment-calendar navigation, feedback, stock investment editing, PWA update/offline shell, and rate-history editing. WebKit runs serially without retries; its ten exact journeys are reported separately and cannot inflate the 70/20/10 pyramid. These are emulated browser profiles, **not** Safari on a physical iPhone or proof of installed Home Screen behaviour. Historical compiled-build transition tests remain conditional as listed by the regression report. Physical iPhone/Android checks and hosted Preview sign-in/feedback need separate evidence.

## Running and failure evidence

Install the matching browsers and system dependencies (`npx playwright install --with-deps chromium webkit`) and run `npm run test:regression` with the documented disposable database. For only the WebKit subset, build first and run `npx playwright test --config playwright.webkit.config.ts`; this narrower command is not the full regression gate. CI records the checked-out commit, engine and failing step in its job log. The cross-browser gate rejects missing, skipped, wrong-engine and flaky results, and reports them separately so repeated tests do not inflate the 70/20/10 pyramid.

Browser tests must use synthetic identities, passwords, recovery codes and account values. Automatic traces, screenshots and videos are disabled because browser captures can contain sensitive inputs or vault content. CI retains the coverage report, feature summary, failure stage, cross-browser result summary, and Playwright HTML/test-results artifacts for seven days. These artifacts are accessible to repository users with Actions run access and may include failure messages and synthetic test values; inspect them before sharing. For an investigation, reproduce locally with synthetic fixtures and capture only the necessary screen with password and recovery-code elements masked. Do not record or upload real user data, credentials, session tokens or recovery codes.

For hosted synthetic journeys, evaluate the existing [issue #37](https://github.com/devcamos/drip/issues/37) with a dedicated Preview account and unchanged deployment protection. Neither this suite nor that issue establishes production monitoring or real-device coverage.
