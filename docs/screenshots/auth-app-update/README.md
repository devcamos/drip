# App update available before sign-in

The signed-out, locked and local-encryption migration screens now mount the
existing update/status controls. Previously only first-use onboarding and the
unlocked account screens mounted them. A worker that blocks authentication for
safety must not leave the signed-out user without an update action.

| State | Viewport | Screenshot |
| --- | --- | --- |
| Signed out with a real waiting update | 390×900 | [Mobile](signed-out-update-mobile.png) |
| Same state | 1280×900 | [Desktop](signed-out-update-desktop.png) |

Captured and visually inspected from the running implementation on24 October
2026. Synthetic local account, secret fields empty, no horizontal clipping.
The screenshots show the existing banner in its newly available location.

Functional evidence: `e2e/auth-pwa-update.spec.ts` passed against optimized
previous build `bd28935` and the corrected current source on the same stable
test origin. It verifies a distinct build identity, waiting-update acceptance,
unchanged encrypted records and an offline reload/unlock with the same £3,000
account. Private APIs are absent from public caches. Three component regressions
fail before the change and pass afterward.

The old signed-out client itself has no new update checks. A normal online
reopening first loads the corrected UI, which can then offer the waiting worker.
This is a local Chromium build transition; it does not establish native iOS or
the user's installed-PWA behavior. No worker safety check or cache policy was
weakened. Exact published-head checks are linked from PR35.
