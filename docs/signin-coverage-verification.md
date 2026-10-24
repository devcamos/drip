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
| Statements | 94.70% | 97.89% |
| Branches | 91.80% | 93.42% |
| Functions | 94.88% | 98.30% |
| Lines | 97.88% | 99.05% |

438 tests across 60 files pass. New regression tests reproduce seven failures
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
No Production login, data/configuration change or release was performed.
