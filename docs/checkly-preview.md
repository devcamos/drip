# Checkly Preview authentication checks

Drip uses Checkly only for synthetic authentication checks against Vercel
Preview deployments. The workflow accepts only successful deployments whose
environment is `Preview`; it checks out the deployment's commit SHA, uses that
deployment's HTTPS URL, and reports a Checkly GitHub Check against the commit.
Production deployments are out of scope.

The deployment URL in a Vercel success event may be an immutable deployment
hostname rather than the stable branch alias. Drip keeps the branch alias as
Better Auth's base URL and trusts the exact Preview deployment origin from
Vercel's `VERCEL_URL` for browser-origin validation. It does not broadly trust
all `vercel.app` hosts, and the deployment workflow still checks out and reports
the specific deployment commit.

The browser journey uses one dedicated synthetic account and verifies password
login, a known saved balance after restoration in a fresh browser context, and
confirmed sign-out. It never creates accounts during scheduled runs, uses no
customer accounts or financial data, and does not capture screenshots, video or
Playwright traces. Recovery codes are not part of the monitor.

## One-time setup

1. Create or connect a Checkly account and confirm its current plan includes
   Playwright browser checks and the needed GitHub and Slack integrations. Then
   connect the Checkly GitHub App to `devcamos/drip` from that same Checkly
   account. The first live run is the proof that the app can report a GitHub
   Check on this repository.
2. Create the GitHub Actions environment `checkly-preview` and add:

   - **Secrets:** `CHECKLY_API_KEY`, `DRIP_CHECKLY_GAMERTAG`,
     `DRIP_CHECKLY_PASSWORD`, `VERCEL_AUTOMATION_BYPASS_SECRET`.
   - **Variables:** `CHECKLY_ACCOUNT_ID`, `DRIP_CHECKLY_ACCOUNT_LABEL`,
     `DRIP_CHECKLY_EXPECTED_BALANCE`, `DRIP_CHECKLY_MONITOR_URL`.

   Use a dedicated synthetic account created in the Preview database. Seed one
   clearly named test account with a stable, synthetic balance. Save its original
   recovery codes during initial signup; never add those codes to Checkly.
3. In Vercel, enable **Protection Bypass for Automation** for the Drip project
   and copy its Preview bypass secret into the GitHub environment secret above.
   Keep Preview Deployment Protection enabled. Never use a Production bypass
   secret or Production account.
4. Connect Checkly's Slack alert channel to `#incidents` and select it on the
   Drip Preview authentication check. Confirm that the Checkly alert contains
   only the check name, deployment URL/commit, step and
   sanitized error summary. Do not include request headers, credentials, page
   contents, account values or recovery material in Slack.
5. Trigger a successful Preview deployment. Confirm the external GitHub Check
   named `Checkly Preview authentication` completes for that deployment SHA.
   Dispatch `.github/workflows/checkly-preview.yml` with `deploy-monitor` to
   publish the one-hour monitor against the stable Preview branch alias in
   `DRIP_CHECKLY_MONITOR_URL`. The deploy passes the synthetic credentials and
   bypass token as Checkly secret environment variables. Keep that URL on a
   Preview branch alias so it follows new deployments on that branch.
   Add that exact check to required branch protection only after the first run
   succeeds and the repository's rules support requiring this external Check.
6. Trigger one controlled Preview failure and verify the `#incidents` alert.
   Use a disposable synthetic failure, then restore the monitor and confirm the
   recovery alert before closing the setup task.

The deployment-status workflow must be present on the default branch before
GitHub will invoke it for Preview deployments. Until this PR is merged and the
account setup above is complete, hosted sign-in remains unverified. The required
check is intentionally fail-closed: missing Checkly credentials,
the GitHub App connection, an unsafe target URL, or an incomplete synthetic
account setup produces a failed check, not a green skip. The Checkly Action
records the checked-out Git commit; do not use the default-branch SHA from the
`deployment_status` event as the result attribution.

## Checkly account and cost

The scheduled monitor runs once per hour from one location to keep browser-run
usage low. Checkly account access, Slack channel wiring and the actual current
plan/quotas must be confirmed in Checkly before the first run. Vercel and GitHub remain the
deployment and source-of-truth systems; Checkly supplies the hosted browser
session and its alerting.
