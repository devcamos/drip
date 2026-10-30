# One original recovery-code set

Captured and visually inspected 26 October 2026 from the local production build
of source commit `ab9b508117a754277afa51c1c83b1ba9c84a4bfa` on PR41. Screenshots
are the running implementation at 390×844 and 1280×900. Full-page captures can
extend beyond viewport height; both sizes passed the no-horizontal-overflow check.

| Changed state | Mobile | Desktop |
| --- | --- | --- |
| Required signup download step | [View](required-download-mobile.png) | [View](required-download-desktop.png) |
| Original file ready, six codes masked | [View](signup-original-ready-mobile.png) | [View](signup-original-ready-desktop.png) |
| Download complete; explicit saved-file confirmation required | [View](confirm-original-mobile.png) | [View](confirm-original-desktop.png) |
| Accounts after confirmation | [View](accounts-after-confirmation-mobile.png) | [View](accounts-after-confirmation-desktop.png) |
| Settings opens the same original set | [View](settings-original-mobile.png) | [View](settings-original-desktop.png) |

Synthetic `original_demo`, empty balances, no customer data. Password inputs and
revealed-code elements are additionally masked during capture; codes remain
hidden through the app's own state. No passwords, raw codes, cookies or tokens
are shown. All ten images were visually inspected.

`e2e/original-recovery.spec.ts` uses the real browser, local encrypted storage,
password unwrap and downloaded text files with a synthetic network backend.
It verifies the required step before Accounts, refresh/sign-in resumption,
six numbered codes, download before confirmation and byte-for-byte identical
original downloads after refresh and from Settings. It does not exercise hosted
authentication, PostgreSQL, physical iPhone or a live cross-device Web Lock.

API route tests cover refusal to replace the first set, idempotent original-set
retry, original public lookup and owner-bound status; database responses are
mocked. Local crypto/IndexedDB tests cover persist-before-request, unknown
network outcome, quota failure, encrypted at-rest material, account changes
and atomic first-candidate retention. Signup tests cover a stalled provisioning
deadline and atomic checkpoint completion/failure. Caller cancellation is tested
with an unresolved fetch; lock behavior is source-reviewed.

Local verification: 411 unit/component tests, 30 ordinary browser passes and
15 existing opt-in hosted tests skipped. Statements 94.07%, branches 91.46%,
functions 93.39%, lines 97.71%. Later focused final-source runs passed 23
signup/original-file tests and 15 affected UI checks; final capture journey passed.
Build, typecheck and import checks passed; audit found zero known vulnerabilities.

Existing accounts keep their currently registered set. The server cannot
reconstruct raw codes: re-download requires the encrypted original on the
issuing browser; another device uses the saved file. Routine replacement and
compromised-code revocation are not provided. No schema migration or Production
change was performed. See [recovery design](../../guided-recovery.md).
