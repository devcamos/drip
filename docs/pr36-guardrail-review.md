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

Fourteen additional component cases now exercise edge paths and file boundaries:

- File import: newest selection wins when an older read fails; safe filesystem
  failure with credential clearing and retry; pending imports ignored after
  disabling, unmounting or cancelling; manual edits clear the imported selector.
  Named text, JSON and PNG fixtures reject malformed or unsupported content;
  a valid downloaded text file also works with a generic file-manager MIME type.
- Setup task: initial storage failure offers setup without claiming completion;
  stale readiness results cannot override a newer saved-code result; leaving
  Accounts discards pending checks and removes the listener; removing a recovery
  method cancels a pending completion fade.

These tests exercise failure handling, competing asynchronous actions and
credential lifetime. They require no production behavior change. No existing
test or coverage threshold was relaxed. Existing browser recovery journeys
continue to test the running application separately from the component mocks.

File extension and MIME type are untrusted metadata. The input's `accept` hint
helps the picker; the size limit and supported-code parser validate content.
Requiring a particular MIME value would reject some legitimate downloaded text
files without strengthening code verification. Unsupported content is neither
executed nor submitted to authentication. This addresses the follow-up file-type
finding without treating picker metadata as an authorization control.

The later report's request for confirmation-method tests is already covered by
the existing named component cases below. No specific failing method was given.

| Component | Confirmation | Existing behavior test |
| --- | --- | --- |
| `PasswordSetup` | Recovery code | [Recovery-verified save/reset, mismatch, failure and secret clearing](../tests/password-ui.test.tsx) |
| `PasswordSetup` | Current password | [Password-confirmed change passes only the verified root to the setter](../tests/password-ui.test.tsx) |
| `PasswordSetup` | Saved unlock passkey | [Fresh passkey confirmation; cancellation makes no credential change; retry succeeds](../tests/password-ui.test.tsx) |
| `PasskeyUnlock` | Recovery code | [Setup, cancellation, unsupported encryption, retry and wrapper removal](../tests/passkey-ui.test.tsx) |
| `PasskeyUnlock` | Current password | [Password-confirmed enrollment and wrong-password rejection](../tests/passkey-ui.test.tsx) |

`PasskeyUnlock` enrolls/removes the local wrapper; it does not offer saved-passkey
confirmation for password changes. That path is in `PasswordSetup` and its tests.
Underlying crypto and server-negative tests are listed in the next section.

## ARCH-007: time-limited recovery-code reveal

The final report asked for strong confirmation and temporary visibility.
Generation already verifies a password, recovery code or fresh unlock passkey;
the verified root, connected cloud owner and successful registration are checked
before codes can be revealed. The list starts masked, requires an explicit Show
action and hides on download, confirmation, window blur and tab hiding.

One concrete visibility gap remained: the list could stay revealed indefinitely
while this window retained focus. It now hides automatically after 30 seconds.
The regression test fails before the timeout and passes afterward; existing
masking/blur/confirmation tests are retained. No root/PRF persistence, additional
credential endpoint or auth-policy change is introduced.

| Guardrail | Current gap | Potential fix |
| --- | --- | --- |
| Recovery-code visibility | Confirmed before this fix: explicit reveal had no time limit while the window stayed focused. | Implemented: 30-second auto-hide, retaining default masking, explicit reveal and blur/tab/download hiding. |

Evidence: [recovery-code component](../app/RecoveryCodes.tsx) and
[focused-window timeout regression](../tests/recovery-codes-ui.test.tsx).

## Security verification requests from the automated report

After the coverage updates, the report raised ARCH-002 and ARCH-003 as requests
to verify controls, while marking all guardrails Pass. No bypass or failing input
was identified. A source/test review found no additional confirmed defect in
these two paths. This is a targeted code assessment, not a penetration test.

| Guardrail | Current gap | Potential fix |
| --- | --- | --- |
| Password changes (ARCH-002) | No missing server authorization check confirmed. `passkeyRecoveryRoot` decrypts the existing root after fresh PRF confirmation and rechecks the local vault/session/wrapper. It does not itself grant a server session or set a password. | Preserve the existing session, owner and recovery-proof checks; retain their negative tests. No duplicate WebAuthn endpoint is needed for this local encrypted-key unlock. |
| Recovery-file validation (ARCH-003) | No unbounded or unvalidated parsing confirmed. The parser caps UTF-8 input at 32,768 bytes, accepts a fixed code grammar/alphabet, deduplicates and requires 1–6 codes. The original file is never sent to auth. | Retain byte/grammar/list limits and malformed/oversized tests. Treat extension/MIME as picker metadata, not proof that a recovery code is valid. |

The password-change path is:
`passkeyRecoveryRoot` → `setLoginPassword` → `/api/auth/gamertag-password`.
The server uses `sessionMiddleware`, derives the owner from that session,
checks `X-Drip-Owner`, verifies the recovery-derived credential against the
account's stored hash, validates envelope ownership/username, and only then
stores the new password hash and revokes other sessions. Client state or
successful file parsing alone cannot satisfy these checks.

Evidence:

- [Fresh local passkey confirmation](../lib/passkey-unlock.ts#L77) and
  [password-change client](../lib/password-login.ts#L93).
- [Server authorization/proof validation](../server/password-login.ts#L83);
  [wrong-proof/owner rejection tests](../tests/password-server.test.ts#L81).
- [Passkey cancellation, wrong PRF and session-change tests](../tests/passkey-unlock.test.ts#L35)
  and [wrapper-change rejection](../tests/passkey-unlock.test.ts#L49).
- [Bounded file parser](../lib/recovery-file.ts#L7),
  [parser boundary tests](../tests/recovery-file.test.ts#L12) and
  [file-input behavior tests](../tests/recovery-input-ui.test.tsx).

**Not verified:** physical-device/password-manager behavior, hosted login on the
final Preview, an independent penetration test or a whole-app security
certification. Existing browser-bound wrapper and lost-key limitations remain
documented in [guided recovery](guided-recovery.md).

Review principles now distinguish a sensitive change from a demonstrated
violation and require inspecting the existing server/helper/test path before
claiming a missing control. Missing context belongs in an unverified follow-up.
No rule severity, gate, test or coverage threshold was reduced or disabled.

## Dependencies compared with main

| Dependency | Main | PR | Decision |
| --- | --- | --- | --- |
| `@types/node` | 26.6.5 | 26.6.5 | Merge main's approved PR #17; do not undo its major upgrade or repeat it here. |
| `next`, `@next/env`, platform SWC packages | 16.4.2 | 16.4.3 | Retain the existing patch upgrade. The release contains bug-fix backports. |
| `fast-uri` (development dependency through Ajv) | 3.1.8 | 3.1.9 | Apply the security patch for four URI parsing/normalization advisories. PR #38 proposes the same patch. |
| `better-auth`, `@better-auth/passkey`, core and adapters | 1.7.12 | 1.7.13 | Upgrade together after reviewing the declaration fix and matching passkey peer requirements. |
| `@better-auth/utils`, `@better-fetch/fetch` | 0.5.0 / 1.3.2 | 0.5.1 / 1.3.3 | Required by the updated auth packages. |
| `set-cookie-parser` | 3.1.4 | 3.2.1 | Transitive resolution within better-call's existing `^3.1.2` range; real Better Auth handler/session tests cover cookie handling. |

No other locked package versions differ from main. Fresh installation, dependency
tree validation, typecheck, unit/component coverage, optimized build and browser
journeys verify the combined dependency set. There is no configured lint script;
the existing dependency import scan is run separately.

The fresh report on the first review commit confirms no material architecture
findings. It also identified the newly available Better Auth patch. Its release
notes fix type-only exports incorrectly declared as runtime values; the core's
provider options concern social providers Drip does not configure. The server
and passkey packages stay paired, without new plugins, providers, auth options
or schema changes. Full local verification was repeated after this update,
including the real Better Auth HTTP handler integration tests with a memory
adapter (synthetic SQL for device-cap coordination), as well as component tests.

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
[Better Auth 1.7.13](https://github.com/better-auth/better-auth/releases/tag/v1.7.13),
[merged Node types PR #17](https://github.com/devcamos/drip/pull/17).

## Local verification

- 394 unit/component tests pass across 50 files. After the
  [check cleanup](pr36-checks-review.md), global coverage is 94.24%
  statements, 91.78% branches, 93.57% functions and 97.73% lines.
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
- A later CI run exposed a timing race in the existing account CRUD test:
  `findByText("My Bank")` could resolve the form's card preview immediately
  before it was removed after saving. The test now waits for the detail-only
  Income predictions region and retains both provider/payment assertions.
  No retry, timeout increase, skip or app behavior change was used.

## Scope and limits

This update changes tests, dependency versions, review evidence and the recovery
reveal timeout/help text. Existing
[UI screenshots](screenshots/guided-recovery/README.md) describe their original
capture commit; no layout or new UI flow was added by this review. A Chromium virtual authenticator
does not establish physical iPhone compatibility. No customer data, Production
database, schema, credentials, release or shared reporting service is changed.
