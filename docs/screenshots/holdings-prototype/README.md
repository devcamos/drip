# Holding cards prototype

Interactive route: `/prototype` on the feature-branch Preview.

[Open the prototype](https://drip-git-prototype-holdings-card-deck-devonte-amos-projects.vercel.app/prototype). Vercel sign-in may be required by the existing Preview protection. The owner-approved branch configuration is now provisioned; the current build and hosted acceptance results are tracked in [PR #43](https://github.com/devcamos/drip/pull/43). The screenshots below remain accurately labelled local captures.

Source tested: `ced53f305e9887bc7326294b0530abd7dcc31950`, based on released main `d9be8d1fabf141761a961dfcee011a60abb62c5a`. Captured 27 October 2026 from the running local production build, not mockups. All eight images were opened and visually inspected. CSS-pixel screenshots; synthetic GBP fixtures only, with no customer data or secrets to mask.

| State | Mobile · 390 × 844 | Desktop · 1280 × 900 |
| --- | --- | --- |
| Compact stack | [Stack](mobile-stack.png) | [Stack](desktop-stack.png) |
| Selected stock | [Expanded](mobile-expanded.png) | [Expanded](desktop-expanded.png) |
| Gradient selection | [Colours](mobile-gradients.png) | [Colours](desktop-gradients.png) |
| Holding editor | [Edit](mobile-edit.png) | [Edit](desktop-edit.png) |

Stack images and desktop expansion are full-page captures; other images show the viewport. The mobile expanded capture scrolls to the wallet so the changed card is legible. The editor captures a synthetic change before saving it. This is Chromium at representative viewports, not physical iPhone or desktop-device certification.

## Scope

- Compact, tilted, overlapping cards show only name and current value. A selected card lifts and unfolds; selecting another closes the first. The deck scrolls independently.
- Stock details show average purchase price, shares, current holding value and annual dividend yield. Cash cards use balance and annual interest rate.
- The editor updates synthetic values, purchase cost, portfolio totals and income estimates. Purchase cost = shares × average price. Estimated annual income = saved value × annual rate / 100; monthly estimate = annual / 12, not a payout schedule. No quotes, FX conversion or provider sync.
- Six selectable gradients plus a custom two-colour blend, live preview, cancel and apply. Pale custom endpoints are shaded to keep white text readable.
- Sample state stays in React memory and resets on reload. This route makes no application API calls, does not register a service worker, and does not access the financial vault. Main Accounts/authentication/storage behavior is unchanged. Real-account fields and persistence are a later implementation step after design approval.

## Validation

- 450 unit/component tests across 57 files passed, including seven new prototype tests.
- Configured coverage: 94.15% statements, 91.83% branches, 94.06% functions, 97.60% lines; existing 85% global and stricter lib gates retained.
- Typecheck, production build and audit passed; audit reported zero vulnerabilities. Repository has no separate lint script.
- Three new real-browser checks passed: mobile, desktop, and 320 × 740 with reduced motion. They exercise expand/collapse, filters, edit/save, gradient preview/cancel/apply, Escape/focus restoration, keyboard traversal, custom colours, reset-on-reload, absence of horizontal overflow, no application API calls and no service-worker registration. No browser page errors occurred.
- Browser testing caught missing focus restoration after dismissing a dialog and corrected it before handoff. Early test-only failures (jsdom dialog shim, fixture arithmetic and a locator tied to an edited balance) were corrected without weakening checks.
- Existing ordinary browser suite was not repeated locally for this isolated route; the PR's full current-head CI is the required gate. Hosted Preview verification is recorded separately in the PR/handoff.
