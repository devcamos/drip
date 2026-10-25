# Sign-in is a release acceptance criterion

Every change, including unrelated UI and dependency updates, must preserve signup,
existing-account login, cloud restoration and sign-out. Coverage remains enforced;
it does not establish that a deployed database and authentication origin work.

## Prevention added after the Preview incident

The affected branch had no `DATABASE_URL`, `BETTER_AUTH_SECRET` or
`BETTER_AUTH_URL`. Existing settings belonged to older branches. Compilation and
ordinary CI succeeded with test configuration, while actual authentication
returned 503. Installing branch-scoped Preview settings and redeploying the same
source restored the reported flow, as confirmed by the user.

Vercel now runs `npm run validate:deployment` **before** `npm run build`. It fails
closed on missing settings, malformed database URLs, short authentication secrets,
non-HTTPS authentication origins or a mismatch with Vercel's stable target URL.
It prints key names/reasons only, performs no network requests and never migrates,
generates or rotates credentials. This is configuration validation, not a database
connectivity test. Normal local/CI builds can still run without cloud credentials.

## Deployed browser verification

`Auth release verification / Deployed signup and login` runs on every pull request
and supports manual dispatch. Before browser credentials are used, it reads the
deployment through Vercel's authenticated API and verifies:

- The approved Drip project/team, Preview target, repository and Git branch.
- Ownership of the configured stable alias, READY status and exact PR head SHA.
- The served build fingerprint, both before and after each journey.

`npm run verify:auth` then exercises the real UI/API/database:

1. Sign into an existing dedicated synthetic account and restore its expected
   balance; sign out and confirm its server session is gone.
2. Create a new synthetic account, arrive on Accounts, save an account and wait
   for cloud sync. Sign out, open a fresh browser context, sign in and verify that
   the saved balance is restored. Confirm sign-out again.

No API interception, simulated login, disabled rate limits or skipped tests.
Legitimate 429 responses use the existing bounded Retry-After helper. Synthetic
signup leaves an isolated test account in Preview; no deletion or Production
data is involved. Repeated runs need an approved retention/cleanup policy.

These tests start with fresh browser contexts and block service workers to test
the current deployed server. They do not replace the separate PWA update/offline
journeys, recovery tests or mobile Safari verification.

## Required activation — not yet verified or configured here

Local verification passed: 481 unit/integration/component tests, 30 ordinary
browser journeys (15 existing opt-in skips), and both new real-database browser
journeys. Coverage is 94.72% statements / 91.94% branches / 95.04% functions /
97.89% lines. Typecheck, optimized build, dependency checks and audit (0 known
vulnerabilities) pass. The missing-settings CLI check exits nonzero before build.
The real-database browser proof uses the guarded isolated database through a
local optimized server, not a protected hosted Preview or Production.

Provider inspection found only the existing Preview/Production GitHub
environments; the auth-verification environment was not configured. Reading
main's branch protection returned HTTP 403, "Resource not accessible by
integration." Required-check enforcement is therefore unverified, not claimed.

Before installing any CI credentials, configure the GitHub environment
`preview-auth-verification` with a required reviewer and prevent self-review.
Review the exact head SHA that will execute. Do not expose these credentials via
repository-wide secrets or to unreviewed fork code.

In that protected environment, configure directly through the providers:

| Type | Name | Purpose |
| --- | --- | --- |
| Variable | `DRIP_AUTH_PREVIEW_ORIGIN` | Approved stable Preview origin for the branch being tested |
| Secret | `VERCEL_PREVIEW_READ_TOKEN` | Least-privilege Vercel deployment-read access, scoped to Drip where supported |
| Secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | Approved Protection Bypass for Automation; never a public share URL |
| Secret | `DRIP_AUTH_EXISTING_TAG` | Dedicated synthetic baseline account created before the candidate update |
| Secret | `DRIP_AUTH_EXISTING_PASSWORD` | That test account's password; no customer credentials |
| Variable | `DRIP_AUTH_EXISTING_BALANCE` | Baseline balance as a decimal, e.g. `1234.56` |

The read token is limited to the metadata step; browser tests do not receive it.
The bypass secret is sent once per browser context to the verified origin with
redirects disabled, to obtain a secure host-scoped cookie. It is not added to
global browser headers or URLs. Traces, videos, screenshots and exported browser
state are disabled. The reporter emits static test titles/status only, suppressing
raw errors, DOM snapshots and credential-bearing browser call logs.

Missing access/configuration causes failure, never a green skip. Each new branch
needs approved Preview provisioning and its correct origin; secrets are not
automatically broadened to all Preview branches. No Production target is accepted.

After publication, run the workflow successfully against the current head, then
make its check required in branch protection/rulesets. Configure Vercel Deployment
Checks to hold Production domain assignment for the existing CI and required
release checks, if supported on the current plan. Do not upgrade the Vercel plan,
force-promote, or call a check required until provider settings are verified.
Preview proof alone does not verify Production configuration; a Production release
still requires authorized staged verification and approval.

## Monitoring and controlled changes

Activate and verify the existing queued 5xx-to-Slack pipeline separately; see
`incidents.md`. No webhook or bypass credential has been created by this change.
Periodic synthetic monitoring is a follow-up requiring an approved scheduler,
account and alert destination. Do not turn a monitoring outage into an automatic
password reset or secret rotation.

Keep the auth origin and secret stable across ordinary redeploys. Review planned
secret rotation, dependency upgrades and schema changes separately, include
existing-account compatibility evidence, and document rollback before release.
The current preflight checks presence and shape; it cannot prove that a secret
was preserved. No claim of NIST/OWASP certification is made.
