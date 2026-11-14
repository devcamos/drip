# Headless browser coverage

## What runs

The [regression catalogue](../../tools/regression/catalog.json) maps the complete Chromium suite to application features. `npm run test:regression` runs it against a local production build, then runs the 14 required cloud journeys against a disposable loopback Postgres database. Its report identifies the executed, conditional and missing journeys; test cases use synthetic identities and balances. The cloud stage does not use a hosted Preview or real user account.

| Critical area | Existing evidence | Additional mobile WebKit gate |
| --- | --- | --- |
| Sign-in, sign-up, recovery | `auth-screens`, `password-login`, `original-recovery` and real-database cloud journeys | `auth-screens` checks navigation, history and password clearing. |
| Accounts and dividend holdings | `saved-experience`, `account-wallet`, `stock-investment` | `stock-investment` exercises editing, encrypted reload and backup restoration. |
| Credit cards and payments | `account-workflows`, `saved-experience`, `payment-calendar` | Chromium only; WebKit remains a gap. |
| Feedback | `feedback` and real-Postgres feedback tests | `feedback` uses a synthetic identity and an intercepted response, with the service worker disabled to allow interception; it does not verify hosted submission or service-worker interaction. |
| Saved app and update | `pwa-current-update`, `worker-safety` | `pwa-current-update` checks the current shell, public fingerprint and offline encrypted data. |
| Cloud sync and devices | `recovery`, `four-device-signin`, `password-race` in disposable local Postgres | Chromium only; hosted and WebKit cloud flows remain gaps. |

The WebKit run uses Playwright's iPhone 13 profile. It is an emulated mobile browser, **not** Safari on a physical iPhone or proof of installed Home Screen behaviour. Historical compiled-build transition tests remain conditional as listed by the regression report. Physical iPhone/Android checks and hosted Preview sign-in/feedback need separate evidence.

## Running and failure evidence

Install the matching browsers and system dependencies (`npx playwright install --with-deps chromium webkit`) and run `npm run test:regression` with the documented disposable database. For only the WebKit subset, build first and run `npx playwright test --config playwright.webkit.config.ts`; this narrower command is not the full regression gate. CI records the checked-out commit, engine and failing step in its job log. The cross-browser gate rejects missing, skipped, wrong-engine and flaky results, and reports them separately so repeated tests do not inflate the 70/20/10 pyramid.

Browser tests must use synthetic identities, passwords, recovery codes and account values. Automatic traces, screenshots and videos are disabled because browser captures can contain sensitive inputs or vault content. CI retains the coverage report, sanitized cross-browser pass/fail summary, feature summary and failure stage for seven days; raw browser result files and `test-results` are not uploaded. For an investigation, reproduce locally with synthetic fixtures and capture only the necessary screen with password and recovery-code elements masked. Do not record or upload real user data, credentials, session tokens or recovery codes.

For hosted synthetic journeys, evaluate the existing [issue #37](https://github.com/devcamos/drip/issues/37) with a dedicated Preview account and unchanged deployment protection. Neither this suite nor that issue establishes production monitoring or real-device coverage.
