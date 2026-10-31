# Device management screenshots

Running optimized implementation from branch `feat/dividend-investment-stats`,
with the four-device limit. Local origin localhost:4321; synthetic `demo_saver29`, generated
encrypted vault and sample balance. These are implementation screenshots, not
design mockups. Synthetic API session responses are used for the UI journey;
real HTTP/auth/database behavior has separate local Postgres integration tests.
No hosted Preview or physical iPhone verification is claimed.

| State | Mobile viewport390px | Desktop viewport1280px |
| --- | --- | --- |
| Device-limit entry point | [Image](device-limit-390.png) | [Image](device-limit-1280.png) |
| Signed-in device list | [Image](devices-390.png) | [Image](devices-1280.png) |
| Explicit sign-out confirmation | [Image](confirm-sign-out-390.png) | [Image](confirm-sign-out-1280.png) |
| Settings entry point (panel capture) | [Image](settings-devices-390.png) | [Image](settings-devices-1280.png) |

All changed states are also checked at320px for horizontal overflow. Password
inputs are visually masked; no recovery code, token, cookie or real user record
is captured. Names and timestamps are synthetic. Mobile/desktop images are
visually inspected before handoff; the screenshot commit records source version.

Reproduce after `npm run build`: run `e2e/device-management.spec.ts` against the
optimized server, setting `DRIP_DEVICE_CAPTURE` to this directory. The ordinary
CI browser suite includes this test without writing screenshots.
