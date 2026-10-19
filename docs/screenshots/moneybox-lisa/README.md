# Moneybox Cash Lifetime ISA

Captured 19 October 2026 from the running local Next.js production build at
`http://localhost:4321`, source `127c951e7769f5ddbb4723557e485f2d3f2261e0`, PR #21.

The real account screen shows the new Moneybox provider and Cash Lifetime ISA
(LISA) classification, entered balance, recorded interest and separate forecasts.
All data is synthetic: `producttest`, £3,000, sample annual rate 4%, recorded income
£22.65 and a manually entered pending bonus £15.44. These are example inputs,
not advertised Moneybox rates or an automatic government-bonus calculation.
No passwords or recovery codes are visible.

| Viewport | Screenshot |
| --- | --- |
| 390 × 1000, full page | [Mobile](mobile.png) |
| 1280 × 1000, full page | [Desktop](desktop.png) |

Both images were opened and visually inspected. The browser check saves and
reopens the LISA, changes its balance, exports an encrypted backup and restores it
in a fresh browser. The LISA label, balance, recorded interest and pending bonus
survive. Recording the bonus clears its prediction without changing the balance.
The same checks also passed for an ordinary Cash ISA; layout checks at 320/390px
found no horizontal overflow. The cloud-only case was explicitly skipped in this
focused run; no hosted cloud or physical iPhone verification is implied.
