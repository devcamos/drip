# Signup failure handling

Tested application source: `aff2f2dcda0480aafc00b8037db54d3d16e5fb6c`.
Captured and visually inspected on 2026-10-23, against the running Next.js
production build on localhost. The synthetic `signup_demo` account was never
registered by these failure tests. Password fields are visually masked in the
captures; no customer account, password, recovery code or token is shown.

| State | Mobile | Desktop |
| --- | --- | --- |
| Signup blocked by sign-in service HTTP 503 | [390 × 844](service-unavailable-mobile.png) | [1280 × 900](service-unavailable-desktop.png) |

These are CSS viewport sizes, full-page captures at the Chromium device's pixel
density. Desktop is the same browser context resized. Both layouts wrap the
message without horizontal overflow. HTTP 503 is deliberately intercepted at
the browser network boundary; this proves the error path, not the availability
of a hosted backend.

Verification: 379 unit/component tests pass, with unchanged coverage gates;
six browser cases cover HTTP 403/429/503 from initial sign-in and registration.
They assert operation-specific messages, no raw server details, an enabled retry
button, no Accounts page after failure, and no registration after an initial
service failure. Three recovery browser journeys also pass, including real
signup, password reset and fresh-browser restoration against the approved
isolated test database. Typecheck, production build, import checks and audit pass
(zero vulnerabilities). Eleven assertions failed against the original error
handling before the fix. The first browser failure run exposed an ambiguous
test locator shared with Next.js's route announcer; the six-case rerun scopes
the assertion to the signup form and passes.

The reported iPhone deployment's full URL and response status are still unknown.
This fix removes misleading recovery-code instructions and unsafe registration
fallbacks; it does not establish or repair that deployment's underlying failure.
No Production access, customer-account lookup, migration or release occurred.
