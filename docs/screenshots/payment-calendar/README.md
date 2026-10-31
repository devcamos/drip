# Payment calendar UI evidence

Captured and visually inspected 31 October 2026 from the actual local production
build, using synthetic accounts. Images crop the Payment calendar panel at CSS
viewports 390×2200 and 1280×2200; the app retains its existing narrow content
width. 320px is separately checked for horizontal overflow. No image edits,
credential masking or API-response mocks are used.

| State | Mobile | Desktop |
| --- | --- | --- |
| Monthly Zopa payment on the 15th; daily and quarterly accounts alongside it | [390px](monthly-calendar-390.png) | [1280px](monthly-calendar-1280.png) |
| Zopa edited to quarterly on the 20th; December's Zopa payment disappears and later quarters update | [390px](quarterly-calendar-390.png) | [1280px](quarterly-calendar-1280.png) |

The browser test uses the real editor, local vault encryption, calendar
calculation and reload/unlock. It verifies received dividends remain £12.50,
the recorded cash balance stays £3,000 and the new quarterly date survives an
encrypted reload. Numbers and account identifiers are synthetic; screenshots
contain no recovery codes, passwords or session credentials.

These are expected dates and amounts, not confirmed provider announcements.
No hosted Preview, Production login or physical iPhone behavior is claimed.
The exact final commit and receipts are recorded outside the application in
Nexus operations and anchored by the PR verification links.
