# Two-device sign-in and safe account switching

21 October 2026. Application source `261a6f608ea1798ced9a3a6fb37bd330806ec3ca`.
Captured from the actual optimized local app with an isolated test database,
Chromium / Pixel 7 emulation, synthetic gamertags and balances. Mobile
**390 × 1000**, desktop **1280 × 1000**. All six screenshots were opened and
visually inspected. Password fields were cleared before capture, so submit
buttons remain disabled until a password is reentered. No UI mocks, passwords,
recovery codes, tokens or customer data appear.

| State | Mobile | Desktop |
| --- | --- | --- |
| A third browser is blocked | [View](device-limit-mobile.png) | [View](device-limit-desktop.png) |
| Explicit switch from a cloud-saved account | [View](switch-account-mobile.png) | [View](switch-account-desktop.png) |
| Unsynced saved account is protected | [View](unsynced-account-mobile.png) | [View](unsynced-account-desktop.png) |

The real-database `e2e/two-device-signin.spec.ts` journey passed. Two independent
browsers restored the same £3,000 account; a third received no session. Same-browser
renewal retained its slot, and sign-out freed a slot. Cancelling a different-account
switch preserved the exact local records and created no target session. Confirming
a clean switch restored the selected account. An offline £200 top-up blocked
replacement and remained available after signing back in to the original account.

The full local unit/component suite passed **336/336** tests across 43 files;
coverage was 94.13% statements, 91.52% branches, 94.06% functions and 97.69% lines.
Optimized build and typecheck passed. Guardian independently passed 51 client
tests and found no confirmed blocking client issue; separate server review
also found no remaining confirmed blocker after its findings were addressed.
Current-head CI is linked from [PR23](https://github.com/devcamos/drip/pull/23).

The nullable session-column migration was tested only on the isolated database.
The release-only legacy-session cleanup was validated there inside a transaction
and rolled back; no sessions were retired by that validation. Browser profiles
count separately; the cap controls active cloud sessions, not offline copies or
keys already held by another device.

To repeat the database-dependent journey, use only the explicitly guarded isolated
test database, serve this build on localhost:4321, then run separately from other
Playwright processes:

```sh
PW_CHROME=/usr/bin/chromium DRIP_CLOUD_E2E=1 DRIP_SIGNIN_CAPTURE=1 \
  npm exec -- playwright test e2e/two-device-signin.spec.ts --workers=1
```

Localhost is test infrastructure. Hosted Preview backend verification remains
blocked by the separately documented credential-transfer authorization; physical
iPhone/Safari and Android behavior remain unverified. No Production change was made.
