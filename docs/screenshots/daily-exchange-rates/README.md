# Daily exchange-rate UI evidence

Captured and visually inspected 31 October 2026 from the running local
production build. The final source commit is anchored by the PR's verification
links and the Nexus operations receipt outside the application repository.

Each image crops the actual **Your investment** panel. CSS viewport sizes are
390×1400 and 1280×1400; the app intentionally has a narrow maximum content width.
320px width is also checked for horizontal overflow. The taller capture viewport
keeps the fixed bottom navigation outside the cropped panel; no UI elements or
credential fields are masked or edited in these images.

| State | Mobile, 390px | Desktop, 1280px |
| --- | --- | --- |
| Daily conversion, separately labeled estimated GBP value | [View](daily-conversion-390.png) | [View](daily-conversion-1280.png) |
| Refresh unavailable, dated last-loaded rate retained | [View](last-loaded-rate-390.png) | [View](last-loaded-rate-1280.png) |
| No usable loaded rate, manual tracking preserved | [View](rate-unavailable-390.png) | [View](rate-unavailable-1280.png) |

Accounts, quantities and prices are synthetic. The public FX response is mocked
to 0.75000 GBP/USD for deterministic screenshots; this is not a current broker
quote or a representation of actual Frankfurter rates. The app, arithmetic,
local encrypted storage, recovery unlock and navigation are real. A separate
local built-server check against the actual Frankfurter API returned valid USD
and EUR rates without an API key; see the Nexus receipt for that proof.

`e2e/exchange-rates.spec.ts` verifies conversion, unchanged recorded balance/cost/
income, refresh failure, encrypted reload, initial failure and successful retry.
No hosted Preview, physical iPhone/PWA or Production claim is made.
