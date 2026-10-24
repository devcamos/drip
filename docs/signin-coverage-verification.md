# Sign-in and coverage verification — 24 October 2026

Coverage now measures `app/**`, `lib/**` and `server/**`; the server directory
was previously outside the coverage scope. `npm test` runs unit, component and
HTTP integration tests together. CI fails if **any** of statements, branches,
functions or lines falls below 85% globally, or for the app or server group.
The library retains its stricter 90% statements/functions/lines and 85% branches.
These are group thresholds, not a claim that every individual file exceeds 85%.
Existing type-only/CSS exclusions are unchanged. CI uploads the coverage report.

| Metric | Whole application | Server |
| --- | ---: | ---: |
| Statements | 94.71% | 97.89% |
| Branches | 91.85% | 93.42% |
| Functions | 95.02% | 98.30% |
| Lines | 97.88% | 99.05% |

445 tests across 60 files pass. New regression tests reproduce seven failures
against the previous sign-in client and pass with the correction: non-JSON429,
null/non-string error responses, null success, and network/abort/timeout errors.
Malformed JSON and server-outage references also have regressions. Failed
responses leave the saved vault intact; device-generation safety errors remain
specific. No password, recovery root or financial data is added to diagnostics.

`password-http.integration.test.ts` drives the **actual Next.js route and Better
Auth handler**, with real validation, password hashing, encrypted wrappers,
signed cookies and session hooks. Eight scenarios cover preflight/no cookie,
successful sign-in/session lookup, uniform credential denials, invalid input
and origins, both login limiters, two-device admission/renewal, sanitized database
failure and recovery-verified password reset/revocation. The auth memory adapter
and a strict SQL double replace storage; these tests do not prove PostgreSQL
locking or hosted connectivity. A controlled clock separates normal journeys
from Better Auth's ten-second attempt window; the rapid-attempt case verifies
that limiter without relaxing it.

Seven auth-configuration unit cases additionally cover missing configuration,
origin and rate-limit settings, bounded/shared pool creation, singleton auth,
invalid URLs and direct/proxy WebSocket selection without network connections.

An optimized local build against the existing isolated test database passed the
browser journey: signup → Accounts → password-confirmed creation of six recovery
codes → reload → password sign-in. The test also checks no plaintext password/root
in IndexedDB and rejects an untrusted origin. The database host is guarded before
the server starts; no schema migration or Production data is used. The existing
19 browser error/auth/offline/vault/passkey journeys also pass.

Build, typecheck and dependency import checks pass. The import scan has the
existing informational service-worker orphan and zero errors/warnings. There is
no separate lint script.

## Production investigation limits

The user identified Production as the failing environment. Read-only deployment
metadata confirms it is still on released commit
`275cc467b991722fae69463ec0a328f06572bce9`, rather than this PR. No errors appeared
in the available recent 30-minute Production log window. Public
`GET /api/cloud/status` returned200 with `available:true`; this checks configured
variables and **does not prove a successful database connection or sign-in**.
The user's exact failure and cause remain unconfirmed pending a fresh error/time
or request reference. Preview's two observed auth503s are separate evidence.
No Production login, data/configuration change or release was performed in that
initial read-only investigation.

## Authorised synthetic Production follow-up

The user subsequently requested testing with our own user account. On24 October
2026 at12:30UTC, an HTTPS API test used the application’s real recovery-credential,
password-proof, encrypted-key and vault-encryption functions against the stable
Production URL. TLS verification remained enabled. One empty synthetic account
was created; no customer account or financial data was accessed.

| Step | Observed result |
| --- | --- |
| Initial lookup for a new recovery identity | Expected401/INVALID_EMAIL_OR_PASSWORD |
| Signup and encrypted empty vault save | 200 |
| Set gamertag/password | 200 |
| Sign out | 200 |
| Password preflight and final sign-in | 200; encrypted root verified |
| Session lookup and vault restore | 200; expected owner and decrypted synthetic identity verified |
| Final sign-out | 200 |

The exact Production sign-in failure was **not reproduced**. Recent Production
error log counts were empty during the test. An automated browser attempt stopped
before any API call with `net::ERR_CERT_AUTHORITY_INVALID` in this cloud execution
environment. This is a browser-testing limitation, not evidence of the user's
failure. Production UI/PWA/iOS behavior remains unverified; the successful API
test does not prove those flows. No TLS bypass, Production deployment/config
change, migration, merge or release occurred. Synthetic credentials remain in a
private mode600 temporary file for reuse; the test session was signed out.

The follow-up also closes a confirmed client diagnostic gap: device-session
failures now use the existing allowlisted logger, a failed saved-passkey lookup
is caught, and password sign-in has a visible fallback for non-Error rejections.
Regression tests check no raw exception/credential details enter logs and manual
password sign-in remains available after a saved-gamertag lookup failure.
The two device-session cases fail against the previous code; the passkey case
also exposes its previously unhandled rejection. All442 tests,19 local browser
journeys, build, typecheck and import checks pass after the correction.

React review: no new dependencies, render-time requests or credential persistence;
effect results retain unmount guards, rejected lookup promises are caught, session
listener cleanup and password-manager attributes remain intact. This follow-up
changes error handling rather than screen layout or navigation. Production UI
screenshots could not be captured because the browser never reached the app.

## Production browser follow-up and signed-out update regression

Production signup and login were subsequently exercised in rendered Chromium
using a TLS-verifying Node HTTPS transport for browser requests. Service workers
were blocked in that remote check; the Node client validated TLS and fulfilled
the browser's same-origin requests. Both an existing synthetic account's login
and a new synthetic signup→Accounts→sign-out→password-login→sign-out flow passed.
Two empty synthetic accounts now remain for test reuse; neither session remains
signed in. This verifies the rendered web flows through that transport, while
installed-PWA/native Safari behavior remains unverified.

Production auth runtime-error aggregation for the recent24 hours returned no
errors. The latest50-minute function-log window contained one expected invalid
recovery-identity warning from the new synthetic signup. These logs cannot
identify a browser failure that never reached the server; they do not establish
that the user's issue is resolved. A request-metric query failed400 and supplied
no additional evidence. The existing released code lacks this PR's structured
request/error diagnostics.

A confirmed separate defect was found: the update/status controls were missing
from signed-out, locked and migration screens, despite old-worker authentication
protection being able to require an update. The existing controls are now also
mounted there. Three regressions fail before and pass afterward. A real optimized
old-build→new-build transition verifies update acceptance, encrypted local-record
retention and offline unlock of the same synthetic account. [Screenshots and
transition limits](screenshots/auth-app-update/README.md).
