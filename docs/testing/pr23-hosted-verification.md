# PR23 hosted verification

21 October 2026. Application source: `fbbfa69661b8f232aa0be47e41444c2e2c34d3c7`.
This follow-up changes documentation and a test synchronization wait only.

Tested Preview deployment: `dpl_EFHdtgpvkjqzDV71i5jJioXPFZiF`, READY on that
exact commit. [Stable Preview](https://drip-git-feat-signup-and-sync-confidence-devonte-amos-projects.vercel.app/)
requires normal Vercel access. Production remains unchanged at
https://drip-one-xi.vercel.app/.

## Verified in the hosted app

- Signup opens Accounts. Two independent browser profiles restore the same
  encrypted £3,000 account. A third is denied without an authenticated session.
- Same-browser renewal keeps its slot; signing out frees a slot for another
  browser. Existing signed-in browsers retain access.
- A different saved account requires explicit consent. Cancelling preserves
  exact local records and creates no target session; confirming restores the
  selected cloud account.
- An offline £200 top-up blocks account replacement. Signing back in to the
  original account retains its £3,200 balance.
- Six distinct recovery codes download in a numbered file. A fresh browser
  restores a synthetic £1,200 account with a code. Password reset preserves that
  balance, revokes the other session, rejects the old password and accepts the new.

The multi-browser journey passed in 29.6 seconds; the separate recovery/reset
journey passed in 15 seconds. Tests used synthetic accounts only on the isolated
Neon test database. No Production records or credentials were accessed.

## Test execution and limits

Hosted adaptations use the stable Preview origin, temporary origin-scoped Vercel
access cookies and browser fetch for session assertions. The financial/auth flow
and strict retained-record comparisons remain intact. Offline sign-out now waits
for the persisted `remotePending:false` confirmation before snapshotting records;
the earlier hosted comparison caught that legitimate metadata write in progress,
with financial ciphertext unchanged.

Deployment Protection remains enabled. TLS uses the configured environment proxy;
only that CA's public-key fingerprint was trusted in the ephemeral test browser.
No shared trust-store change, general TLS bypass or insecure HTTP option was used.
Traces, videos and screenshots were disabled for secret-bearing recovery tests.
A temporary access token appeared in one failed direct-HTTP test log and was
revoked/replaced before continuing; final temporary access is revoked after use.

Earlier access/network failures are not counted as passing tests. Direct HTTP
assertions could not use this environment's proxy, so the final assertions run
through the browser. The managed fetch helper's short-lived access was replaced
with a separately bounded 15-minute Preview share grant for the browser run.

[CI61](https://github.com/devcamos/drip/actions/runs/39559072313) passed on the
application source: 336 tests/43 files, unchanged coverage gates, typecheck/build,
zero audit vulnerabilities and 20 standard browser journeys (14 opt-in skips).
The final documentation/test commit's checks are linked from
[PR23](https://github.com/devcamos/drip/pull/23).

[Inspected sign-in screenshots](../screenshots/two-device-signin/README.md) and
[wallet screenshots](../screenshots/account-wallet/README.md) show the same
implementation using synthetic data. Physical iPhone/Safari/Android installs
remain unverified. This is release preparation, not a full security certification
or a Production deployment.
