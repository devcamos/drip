# PR35 guardrail findings

Reviewed the intelligence comment on source `41e7ad5`, which labelled two
ARCH-009 findings high while marking the corresponding protections Pass.
The HIGH label is the model's assessment, not an audit vulnerability result.
The referenced rule's configured default severity is medium; the report did
not explain why these instances warranted higher severity.

| Guardrail | Confirmed evidence | Disposition |
| --- | --- | --- |
| Safe API failures | Auth GET/POST and cloud GET/PUT already wrap their complete handler with `withApiErrors`. Recovery POST/PUT and cloud-status GET also use it. | The named-route leakage claim is unsupported by current code. Keep the existing wrappers and sanitization tests. |
| Client failure diagnostics | Signup draft preparation, app-lock recovery, passkey registration and backup export/restore catches omitted structured diagnostics. Local passkey support/verification helpers also swallowed unexpected exceptions. | Add sanitized `logFailure` calls and explicit backup operation names. Keep fail-closed behavior, retry messages and saved data intact. |
| Dependency compatibility | Audit reports no known vulnerabilities. Runtime and type definitions are Node24; Node26 definitions are an available major upgrade. | Availability is not a vulnerability. Retain matching types; evaluate PR17 separately. |

The API exception wrapper records a safe category/reference and replaces thrown
or returned 5xx bodies with allowlisted JSON. It drops upstream failure cookies;
expected non-5xx denials retain their intended responses. The queue callback uses
the queue SDK's failure/retry contract instead of recursively scheduling incidents
about its own delivery failures.

Evidence: `app/api/auth/[...all]/route.ts`, `app/api/cloud/route.ts`,
`app/api/recovery-codes/route.ts`, `app/api/cloud/status/route.ts`,
`server/http-errors.ts`, `tests/api-failures.test.ts`, `tests/http-errors.test.ts`
and the incident-pipeline tests. A failed configuration check remains a genuine
hosted-verification blocker; this disposition does not waive it.

## Client regression evidence

Six targeted assertions failed before the corrections: signup initialization,
backup sharing failure, backup restoration failure, app-lock setup, app-lock
recovery and unexpected native authenticator failure. They pass after the fixes.
Diagnostics tests prove backup error messages/file contents/recovery codes are
not serialized. Expected user cancellation remains quiet; no new telemetry
endpoint, raw-error logging, credential change or data migration was added.

## Report clarity and rollout

The shared report generator is in `devonte-amos-apps/pr-intelligence`. A separate
change renames reader-facing Areas/Area to Guardrails/Guardrail, retaining the
existing structured JSON fields for compatibility. Its guidance asks for concrete
failing behavior, consistent statuses, and verification follow-ups when truncated
input omits relevant context. No severity cap or quality-gate exemption is added.

Drip's repository review principles now reinforce the same evidence requirements.
The currently used shared `v1` workflow generates the report without a separate
risk-failure job; a green review job means report generation succeeded, not that
all reported findings passed. Newer shared main has additional gate functionality;
this change does not silently repoint a version tag or adopt unrelated workflow
behavior. Shared publishing/release and a consumer version update remain separate
from the app fix.

Sonar is outside this fix's scope. Hosted login CI credentials and real Slack
delivery remain unconfigured; Checkly evaluation is tracked in issue37.
