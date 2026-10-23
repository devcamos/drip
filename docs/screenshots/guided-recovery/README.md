# Guided recovery evidence

Source: `00c31d4f0693684e3b065f689cf1375bc0c42408`, based on main
`275cc467b991722fae69463ec0a328f06572bce9`. Captured 23 October 2026 from
the optimized local build at localhost:4343. The evidence commit adds only these
screenshots and documentation; the tested app/lib/server source is unchanged.

## Screenshots

| State | Mobile | Desktop width |
| --- | --- | --- |
| Recovery setup task on Accounts | [390 × 844](recovery-setup-task-mobile.png) | [1280 × 900](recovery-setup-task-desktop.png) |
| Missing password/codes guidance | [390 × 844](missing-credentials-mobile.png) | [1280 × 900](missing-credentials-desktop.png) |
| Configured passkey on Forgot password | [390 × 844](passkey-recovery-mobile.png) | [1280 × 900](passkey-recovery-desktop.png) |
| Passkey-confirmed password reset | [390 × 844](passkey-password-reset-mobile.png) | [1280 × 900](passkey-password-reset-desktop.png) |

All eight captures were opened and visually inspected. These are full-page
screenshots, so image height can exceed viewport height. The existing fixed
bottom navigation appears at its viewport position. Desktop captures resize
the same Pixel 7 Chromium context; they do not establish native desktop or iOS
password-manager compatibility. Horizontal overflow checks passed at both widths.

Fixtures contain synthetic identities and a £3,200 Zopa balance. Password inputs
and any recovery-code list are masked by screenshot-only styling. No Production
access, real user data, real passwords or recovery codes are included. The
passkey tests use Chromium's virtual PRF authenticator and the actual app crypto.
No screen is a generated mockup.

## Verification

- Four new regressions failed before implementation and passed after it.
- 364 unit/component tests passed with existing coverage gates: 94.11%
  statements, 91.67% branches, 93.61% functions and 97.69% lines globally.
- Three new browser journeys passed, including an isolated-backend signup →
  password-confirmed passkey setup → forgotten-password passkey unlock → new
  password → old-password rejection → fresh-browser restore of the same £3,200.
  Six-code creation/download confirmation and final server sign-out also passed.
- Twelve existing browser journeys passed: auth/history, encrypted storage and
  migration, passkey/offline/sign-out fallback, backup import/export, calculations,
  app lock and PWA assets.
- Typecheck, optimized build, dependency import checks and security audit passed
  (zero vulnerabilities; no lint script is configured). Import scanning reports
  the existing generated `/sw-build.js` route as informational only.

The final spacing adjustment was rebuilt and the two screenshot journeys rerun.
This does not claim a hosted Preview/Production login test, physical iPhone test,
new email reset, cross-device passkey-key restoration or recovery of an already
lost encryption key. See [recovery design and limits](../../guided-recovery.md).
