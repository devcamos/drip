# Recovery guardrail review

Reviewed against main `4df42e60c2bd80c7edaf0991c4d22fbdd6e32eb0`
on 25 October 2026. This records the disposition of PR #36's architecture
report; it does not change rule severities, test gates or report output.

## ARCH-008: recovery component coverage

The report named the existing autofill and file-input tests without identifying
a failing behavior. The autofill tests already protect mount-time autofill and
clearing credentials when leaving the recovery screen. Recovery password changes,
passkey cancellation, code registration, download confirmation and vault binding
also have component or crypto/persistence tests.

Ten additional component cases now exercise previously uncovered edge paths:

- File import: newest selection wins when an older read fails; safe filesystem
  failure with credential clearing and retry; pending imports ignored after
  disabling, unmounting or cancelling; manual edits clear the imported selector.
- Setup task: initial storage failure offers setup without claiming completion;
  stale readiness results cannot override a newer saved-code result; leaving
  Accounts discards pending checks and removes the listener; removing a recovery
  method cancels a pending completion fade.

These tests exercise failure handling, competing asynchronous actions and
credential lifetime. They require no production behavior change. No existing
test or coverage threshold was relaxed. Existing browser recovery journeys
continue to test the running application separately from the component mocks.

## Dependencies compared with main

| Dependency | Main | PR | Decision |
| --- | --- | --- | --- |
| `@types/node` | 26.6.5 | 26.6.5 | Merge main's approved PR #17; do not undo its major upgrade or repeat it here. |
| `next`, `@next/env`, platform SWC packages | 16.4.2 | 16.4.3 | Retain the existing patch upgrade. The release contains bug-fix backports. |
| `fast-uri` (development dependency through Ajv) | 3.1.8 | 3.1.9 | Apply the security patch for four URI parsing/normalization advisories. PR #38 proposes the same patch. |

No other locked package versions differ from main. Fresh installation, dependency
tree validation, typecheck, unit/component coverage, optimized build and browser
journeys verify the combined dependency set. There is no configured lint script;
the existing dependency import scan is run separately.

The runtime remains Node 24.22.1 / `24.x`, as configured on main. Node 26 type
definitions are compile-time declarations, not a runtime upgrade, and can expose
APIs absent from Node 24. This PR adds no Node 26 runtime APIs. The inherited
typing/runtime difference should be considered when reviewing future server code;
it is not an established vulnerability or a reason to revert PR #17 silently.

The fresh main audit reports four advisories in one affected package (`fast-uri`):
two moderate and two low. The updated PR lockfile audit reports zero known
vulnerabilities. The earlier report's Node type version suggestion was an upgrade
suggestion, not evidence of a security advisory against `@types/node`.

Sources: [Next.js 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3),
[fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9),
[merged Node types PR #17](https://github.com/devcamos/drip/pull/17).

## Local verification

- 389 unit/component tests pass across 50 files. Global coverage is 94.19%
  statements, 91.79% branches, 93.51% functions and 97.71% lines.
- `RecoveryCodeInput`, `RecoveryTask`, `recovery-file` and `recovery-readiness`
  each have 100% statement, branch and function coverage. This supplements their
  behavior assertions; coverage alone is not a guarantee of correctness.
- 29 running-app Chromium journeys pass, including local code-file recovery,
  saved PRF passkey recovery, six signup-error cases, encrypted persistence,
  sign-out and offline fallback. The existing 15 opt-in database/cross-build
  journeys were not enabled for this run; their older evidence is separate.
- Fresh `npm ci`, `npm ls --all`, typecheck, optimized build and dependency import
  checks pass. The generated `/sw-build.js` route remains informational only
  in import scanning. A fresh audit reports zero known vulnerabilities.

## Scope and limits

This update changes tests, dependency versions and review evidence. Existing
[UI screenshots](screenshots/guided-recovery/README.md) describe their original
capture commit; no UI was changed by this review. A Chromium virtual authenticator
does not establish physical iPhone compatibility. No customer data, Production
database, schema, credentials, release or shared reporting service is changed.
