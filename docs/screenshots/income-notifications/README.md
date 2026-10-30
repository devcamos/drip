# Income and notification screens

Local optimized candidate build on29October2026, branch
`feat/payment-reminders-dividend-portfolio`, basecd07041.
Synthetic encrypted accounts only. No customer data, credentials or recovery
codes appear. Captured from the running app with Playwright and each image
visually inspected. Widths refer to CSSpixels; Chromium mobile device scale is
retained in the PNGs. Layout also checked at320pixels with no horizontal overflow.

| State | Mobile390 | Desktop1280 |
| --- | --- | --- |
| Dividend income, forecasts and holdings | [Mobile](portfolio-390.png) | [Desktop](portfolio-1280.png) |
| Cash/dividend dates, logged-payment guidance, phone setup unavailable | [Mobile](reminders-390.png) | [Desktop](reminders-1280.png) |

These images prove the local implementation's appearance. No phone transport is
configured here, and they do not prove notification receipt. Full-page capture
includes the fixed bottom navigation at its viewport position; content remains
scrollable in the real viewport. Hosted Preview and real-device checks remain
required. See [deployment and verification](../../payment-notifications.md).
