# Signup and save confidence — implementation evidence

Captured and visually inspected on **20 October 2026** from the running optimized
Next.js build at local `http://localhost:4321`, using the isolated test backend.
Application source: **323c2801dcf8961caedcb138cf7024bc59424bf5**. Subsequent changes
in this evidence commit affect only browser-test capture/timeouts and these files;
application source is identical. These are implementation captures, not mockups.

Mobile viewport **390 × 900**; desktop **1280 × 900**, Chromium with Pixel 7 browser
emulation. Signup/Accounts captures are full page; projection and payment captures
crop the relevant region. The app deliberately keeps a narrow reading column on
desktop. Every image was opened and inspected; no horizontal overflow was detected.

| State | Mobile | Desktop |
| --- | --- | --- |
| Signed out: visible Sign up and separate Forgot password | [View](signed-out-mobile.png) | [View](signed-out-desktop.png) |
| Signup with retained-account explanation and consent | [View](retained-signup-mobile.png) | [View](retained-signup-desktop.png) |
| Taken gamertag: entries kept, old account retained | [View](duplicate-name-mobile.png) | [View](duplicate-name-desktop.png) |
| Successful signup opens empty Accounts | [View](new-account-mobile.png) | [View](new-account-desktop.png) |
| Offline with no queued edits and last confirmed cloud save | [View](offline-clean-mobile.png) | [View](offline-clean-desktop.png) |
| Projection save failure keeps £200 / 3-year entries | [View](projection-save-failure-mobile.png) | [View](projection-save-failure-desktop.png) |
| Payment-removal failure keeps £22.65 receipt | [View](income-remove-failure-mobile.png) | [View](income-remove-failure-desktop.png) |

## Data and masking

All identities, accounts and balances are synthetic. Filled password inputs are
visually hidden using screenshot-only text/caret CSS, retaining the real form and
validation state; no password, recovery code, token, cookie or customer data is
published. The signup test uses real registration, duplicate-gamertag rejection,
cloud saves and fresh-browser password recovery of the original £1,234 account.
The original account is never uploaded into its replacement.

The projection and payment failure test injects **one IndexedDB data-write error**
per action to simulate a disk failure. Rendering, encryption, transaction error
handling and subsequent successful retry remain real. Those screenshots therefore
show a deliberately induced failure, not an observed customer storage outage.

## Functional verification

- **283/283 unit/component tests passed**; coverage 94.49% statements, 91.27%
  branches, 94.25% functions and 97.93% lines. Existing thresholds are unchanged.
- Typecheck, optimized build and dependency audit passed; audit found no
  vulnerabilities. [Source CI](https://github.com/devcamos/drip/actions/runs/39390235212)
  passed for source323c280.
- The broad real-backend browser run passed **29/30 journeys**. Its one failure was
  a 30-second assertion during real get-session throttling; the mounted app retries
  at 60 seconds. Real-cloud test waits now allow that existing retry, with the
  limiter and ownership checks unchanged. Focused rerun results are recorded below.
- Signup replacement passed cancellation, duplicate-name failure, successful empty
  replacement and fresh-browser access to the original account. Projection and
  income-removal failure/retry journeys passed; saved balances remain manual.
- Guardian independently closed the final signup reservation comparison and invalid
  foreign-account fixture findings, with 60 maintained and two synthetic checks.
  It also verified the 429/503 handling and wrong-owner isolation with three checks.
  This is a scoped review, not a complete security certification.

## Limits and hosted blocker

This is local Chromium evidence; physical iPhone/Safari and Android installation
were not verified. The hosted [Preview deployment](https://vercel.com/devonte-amos-projects/drip/9bSsiwDQbDpSQNAFry2Ndjbbf9p3)
for source323c280 builds successfully, but an authenticated read of
`/api/cloud/status` returned **200, {"available":false}**. Hosted signup validation
is blocked until an isolated Preview backend is configured. Production is unchanged.
No cancelled or absent Sonar analysis is counted as a passing check.

Final focused results on the unchanged application source: signup replacement
**passed** (20.8s); injected projection/payment failure and retry **passed** (3.5s);
fresh-device/offline-sync/stale-device-conflict journey **passed** (10.7s) after
its waits were aligned with the real retry interval. All 30 distinct journeys have
passing evidence across the broad run and focused reruns; this is not a claim of
one uninterrupted 30/30 run.

Reproduce the important captures against the isolated local backend:

```sh
PW_CHROME=/usr/bin/chromium DRIP_CLOUD_E2E=1 DRIP_CONFIDENCE_CAPTURE=1 \
  npm exec -- playwright test e2e/password-login.spec.ts e2e/save-confidence.spec.ts \
  --grep 'signed-out signup|failed projection' --workers=1
```

The backend must be isolated and authorized. Ordinary CI skips real-cloud journeys
without `DRIP_CLOUD_E2E`; it still runs the local/UI/PWA browser checks.
