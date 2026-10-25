# PR #36 check fixes

Baseline: Sonar check `121244962241` on `201cca8` published ten annotations:
two failure-level complexity findings and eight warnings. GitHub made these
available even though the Sonar background-task API returned HTTP 403.

| Finding | Change |
| --- | --- |
| `RecoveryCodes` complexity 20, limit 15 | Separate the confirmation-method dispatch and reusable credential field from the panel. Preserve verification, cloud-owner checks, masking and the 30-second reveal timeout. |
| `SignedOutScreen` complexity 17, limit 15 | Extract presentation copy and reuse the sign-in visibility condition; keep the navigation key and credential lifetime unchanged. |
| Nested conditionals | Replace nested method/phase/title selection with clear statements or small helpers. This also fixes an extra title-selection issue found locally. |
| Status accessibility | Use native `output` for recovery completion and remove the redundant explicit status role from the existing output. Preserve completion spacing/font styling. |
| List identity | Key the deduplicated code choices by their stable value while keeping labels masked. |
| Redundant fragment | Remove the single-child fragment around password sign-in. |
| Conditional database test | Explain next to the existing condition that it creates synthetic records and requires the isolated Preview database. Keep the test, condition and runtime reason unchanged. |

Local SonarJS reproduced both original complexity findings. After refactoring,
the affected files have no complexity-over-15, nested-conditional or unexplained
skipped-test findings under those same rules. This local check is supplementary;
it does not claim the hosted analysis has succeeded.

Verification: 394 unit/component tests pass, including password, passkey, code
import, autofill, masking and timeout cases. Coverage is 94.24% statements,
91.78% branches, 93.57% functions and 97.73% lines. Typecheck, optimized build,
dependency import checks and audit pass with zero known vulnerabilities.
The ordinary browser suite is also rerun; the existing 15 opt-in database or
cross-build journeys remain separately configured.

React review: extracted helpers/components are declared outside render, props
remain readonly, inputs remain controlled and labelled, hooks stay unconditional,
and listener/timer cleanup remains intact. No new application dependency or
authentication/persistence behavior is introduced.

No quality gate, rule threshold or test was weakened. No exclusions, suppressions,
`NOSONAR`, replacement scanner workflow or Sonar credentials were added.

The hosted check reports "analysis failed" with a cancelled conclusion. Its
background-task error is not exposed by GitHub's summary, and the Sonar API
still returns HTTP 403 here. Source findings and that analysis-service problem
must be verified separately; the failed task's Show Error Details is needed to
diagnose an ongoing cancellation. Existing main-branch cancellations predate
these changes, so warning counts alone do not establish that cause.
