# Simple gamertag sign-in

Captured 26 October 2026 from the running local optimized Next.js build, using
UI source `b71588c70746d30171d53ebffadb8242cb77464c` on
`fix/post-deployment-signin`, based on main `11a784e`.
This gallery shows actual rendered screens, not design mockups. Later removal
of the unused separate-account prop preserves the pictured layout.

| State | Mobile, 390 × 844 | Desktop, 1280 × 900 |
| --- | --- | --- |
| Standard sign-in | [View](login-mobile.png) | [View](login-desktop.png) |
| Returning account, full gamertag prefilled | [View](saved-gamertag-mobile.png) | [View](saved-gamertag-desktop.png) |
| Separate signup | [View](signup-mobile.png) | [View](signup-desktop.png) |
| Recovery after Forgot password | [View](recovery-mobile.png) | [View](recovery-desktop.png) |
| Accounts after password sign-in | [View](accounts-mobile.png) | [View](accounts-desktop.png) |

All ten images were opened and visually inspected. Both widths pass the
horizontal-overflow check. Full-page captures can exceed viewport height; the
fixed Accounts navigation appears at the original viewport edge in that capture.
The Accounts layout itself is unchanged by this change.

`demo_saver201`, its £1,234 balance and encryption records are synthetic local
fixtures. Password/recovery inputs are empty in the pictured states; the capture
also hides password text. No customer records, cookies, tokens, recovery-code
values or cloud accounts are included.

## What changed

- Fresh, locked and signed-out users see the same gamertag/password form.
- One Sign in button. Separate Sign up and Forgot password routes. Saved
  passkeys/codes remain recovery options; there is no separate other-account
  login route. Old account-switch bookmarks still open the shared form.
- A saved-name lookup cannot overwrite a gamertag already typed/autofilled.
- Signed-out users can see and accept a ready PWA update before signing in.
- Verified-account switching still requires consent and protects unsynced data.

## Verification scope

The new browser journey runs the real UI, password cryptography, encrypted
IndexedDB, session gate, sign-out and offline worker. Its online API responses
are synthetic and clearly isolated in `e2e/gamertag-signin.spec.ts`; it proves
client behavior, not live server authentication. Existing server/client unit
regressions cover password verification, owner binding, reset races and device
limits. No authentication wire format, password hash, encryption scheme,
database schema or existing account is changed.

The separate opt-in `e2e/signin-update.spec.ts` exercises two actual local builds
on one stable origin, preserving password metadata and encrypted records through
update acceptance and offline login. Both builds must have cloud configuration
disabled. It does not assert an online database login across deployments.

Local validation: 414 unit/component tests passed; statement/branch/function/line
coverage 94.04/91.76/93.54/97.82%. The final sign-in cleanup then passed all 18
affected component tests. Typecheck and optimized build pass; audit reports zero
known vulnerabilities. The standard browser run initially had 29 passes and
three failures: a stale recovery-action selector, a touch-gesture timing failure,
and colliding trace files from overlapping runs. After correcting the selector,
the isolated rerun passed all affected recovery/product/wallet tests plus the
real build-update journey (six passes, two existing database opt-ins skipped).
The first update-test attempt also found an ambiguous alert selector including
Next's route announcer; the corrected test targets the actual login-form error.
No test assertion was weakened or retry/gate changed.

The dependency-cruiser command exits successfully but reports zero sources
because its compiler loader does not support the repo's TypeScript 7. Do not
treat that command as a completed import analysis; the actual typecheck/build
passed. No dependency/runtime upgrade is included in this UI change.

Hosted existing-account login, physical iPhone/Apple Passwords behavior and the
user's reported Production failure remain unverified. Automatic approval review
blocked a synthetic-account write to the isolated Preview database; that test
has not run and requires explicit user approval. No Production data, secret,
migration or release operation was performed for this change.
