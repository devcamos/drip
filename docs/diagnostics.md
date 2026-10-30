# Errors and diagnostics

Server 5xx can additionally trigger signed, queued Slack alerts when explicitly
configured. See [incident delivery and activation](incidents.md). Browser console
records stay local; Slack does not receive raw exceptions or application data.

Drip records structured failures at the API, browser request, local storage and
render boundaries. Server records appear in Vercel runtime logs. Browser records
stay in the browser console: there is no telemetry upload or third-party SDK.

```json
{"app":"drip","event":"operation_failed","operation":"auth","kind":"schema_mismatch","status":503,"requestId":"11111111-1111-4111-8111-111111111111","durationMs":12}
```

Fields are limited to a fixed operation, error category, HTTP status, generated
request reference and duration. The logger does not serialize exceptions, stacks,
messages, query strings, headers, request/response bodies, account identifiers,
passwords, password proofs, recovery codes, encryption material or financial data.
This contract covers Drip's diagnostic logger, not third-party/framework output.
Browser duplicates are limited to one per operation/category/status each minute;
intentional aborts and passkey cancellations are ignored. Logging failure must
never break the original operation.

All private API boundaries return a generated `X-Drip-Request-Id`. Incoming client
IDs are ignored. Unexpected failures return non-cacheable JSON503 with a stable
code, safe message and the same reference. Authentication, authorization,
validation, conflict and rate-limit responses keep their existing statuses;
these are warning records, not evidence of a server outage. Successful auth
cookies and device-cap protections are preserved.

Password sign-in and cloud-save outage messages include a validated reference
when supplied by the server. Search that reference in Vercel logs. For other
requests it is available in the response header. Error screens offer an explicit
retry and do not reset storage or automatically replay writes. Existing save and
account-switch behavior continues to retain data after failures.

## Production checks

`/api/cloud/status` reports configuration presence only. `available:true` does
not establish that authentication or its database schema works. Check both
`/api/auth/ok` (200) and a fresh unauthenticated `/api/auth/get-session` (200/null)
before making an auth release live, then verify a synthetic sign-in journey.
Do not send real credentials, personal data or raw log exports to external tools.
Vercel Hobby retains only a recent runtime-log window; use a short window such
as 30 minutes and filter by the failing deployment/reference.

The 23 October Production outage is a missing `session.dripDeviceId` migration.
Logging makes this failure traceable; it does not apply that migration. Production
schema changes require their own explicit approval.
