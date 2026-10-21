# Account choices and colours

21 October 2026. Actual optimized local application, synthetic `portfolio_demo`
accounts, Chromium with Pixel 7 emulation. Application source:
`847c5290bab5e8b29f482fd006b1408f3b39b6c4`. Later evidence changes only adjust
the capture harness/documentation. No password, recovery code, token or customer
data is visible; no UI content is mocked or masked.

Screenshots show the actual viewport, mobile **390 × 1000** and desktop
**1280 × 1000**. Account-list captures scroll to the cards. Long forms continue
below the viewport; the fixed bottom navigation is part of the running app.
All ten final images were opened and visually inspected. Separate functional
checks confirm no horizontal overflow at 320/390 px on the custom stock form
and account list. Card spacing was corrected after the first visual review so
later cards no longer overlap earlier income estimates.

| State | Mobile | Desktop |
| --- | --- | --- |
| Lloyds easy-access saver: edit an existing white colour | [View](lloyds-edit-mobile.png) | [View](lloyds-edit-desktop.png) |
| Trading 212: selected holding and colour preview | [View](stock-form-mobile.png) | [View](stock-form-desktop.png) |
| Other stock/fund: user-entered holding name | [View](custom-stock-form-mobile.png) | [View](custom-stock-form-desktop.png) |
| Saved Realty Income account | [View](stock-detail-mobile.png) | [View](stock-detail-desktop.png) |
| Distinct account cards after saving | [View](accounts-mobile.png) | [View](accounts-desktop.png) |

## Behavior verified

`e2e/account-options.spec.ts` exercises actual encrypted IndexedDB migration,
Lloyds creation, white card/dark text, nickname-only editing without colour loss,
reload/unlock, all six stock options, manual balance/yield/schedule, preset
colour selection, custom-stock validation, and encrypted file export/import
into a fresh browser. It then verifies selected and custom names, both colours,
yields and frequencies, plus Lloyds classification/balance after another reload.

The shortlist is names only: Realty Income, Digital Realty, Prologis, American
Tower, Brookfield Infrastructure, and Air Products and Chemicals. No live stock
catalogue, ticker interpretation, market rate or brokerage integration is claimed.
Users can track a whole account or enter another holding. Provider identity does
not determine ISA status. Colour changes do not alter financial calculations.

303 unit/component tests passed with unchanged gates: 94.49% statements,
91.63% branches, 93.97% functions, 97.87% lines. Optimized build/typecheck and
dependency audit passed (zero vulnerabilities). Focused Guardian review found
no confirmed new security blocker; its independent 45 focused tests passed,
and 4,096 colour samples stayed above 4.5:1 text contrast. No security
certification is implied.

The standard browser suite passed **19/19 runnable journeys** (13 intentional
cloud-backend/coordinated-upgrade skips). [Application-source CI passed](https://github.com/devcamos/drip/actions/runs/39528534360)
with the same checks. Final evidence-head CI is tracked from the PR.

Encrypted cloud-payload unit round trips verify both selected/custom holding
identity and colour survive while private nicknames stay excluded. This is
separate from the running browser's file-backup restore journey. New-client
compatibility with old accounts is covered; preservation through a downgrade
to a pre-feature client is unsupported/unverified.

To reproduce these captures (run separately from other Playwright invocations):

```sh
PW_CHROME=/usr/bin/chromium DRIP_ACCOUNT_OPTIONS_CAPTURE=1 \
  npm exec -- playwright test e2e/account-options.spec.ts --workers=1
```

The server must serve the current optimized build on localhost:4321. That URL is
local test infrastructure, not a user-accessible Preview link. Hosted Preview
signup validation remains blocked by the separately documented credential
authorization; no transfer was retried. Physical iPhone/Safari/Android behavior
has not been verified, and no Production release was made.
