# Sign-in outage evidence

Captured 23 October 2026 from the running optimized local build on
`fix/structured-error-handling`, based on Production source `275cc467`.
The implementation and captures are committed together on this branch.

- [Mobile sign-in outage](signin-outage-mobile.png): Pixel 7 Chromium emulation,
  412 × 839 CSS viewport, full-page capture.
- [Desktop-width sign-in outage](signin-outage-desktop.png): same Chromium
  context resized to 1440 × 1000 CSS viewport, full-page capture.

Both images were opened and visually inspected: message/reference remain within
the form, controls are readable, and there is no horizontal clipping. This is
local Chromium evidence, not native iOS or hosted Preview verification.

The auth response is mocked to HTTP503 with a fixed synthetic request reference;
the actual sign-in form, password request handling and diagnostic logger run.
The username is synthetic. The password field was cleared before capturing.
No real account, password, recovery code, cookie, balance or token is shown.

`e2e/error-handling.spec.ts` verifies that the outage shows a safe message and
reference and that the diagnostic record excludes the username, password and raw
server message. Run with `DRIP_CAPTURE_ERRORS=1` to refresh these captures.
