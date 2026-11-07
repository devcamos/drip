# Profile settings and multiple accounts

Open the [Accounts prototype](https://drip-git-prototype-first-impression-devonte-amos-projects.vercel.app/prototype/welcome), choose **Enter demo**, then tap **dg**. It now opens **Profile & settings**. Previously this button returned directly to the demo sign-in screen.

To try multiple accounts, close settings and press **+** beside **Your accounts**. **Stocks & funds** adds a second sample holding, Digital Realty; **Credit card** adds a second sample card, Lloyds. Repeat either choice to add more. Each card keeps its own figures. All samples and preferences reset on refresh or **Reset demo**.

## What is supported

| Area | Current behaviour | Boundary |
| --- | --- | --- |
| Profile entry | Initials open a native settings dialog; closing/Escape returns focus to the initials. | Synthetic `demo_grower` profile, not a live account. |
| Account management | Settings shows counts and returns to the account stack. The + chooser adds separate sample accounts. | Existing empty-account mode still demonstrates the first-use design. |
| Income preference | Monthly/yearly preference updates the dashboard and remains consistent when changing prototype screens. | In-memory only; no user settings are persisted. |
| Sign-out | A labelled **Sign out of demo** action returns to the sample sign-in screen. | Does not call or test the real authentication service. |
| Multiple stocks | Holdings have separate IDs, public chart symbols, quantities, purchase costs, recorded values and applied USD prices/FX. | Synthetic figures; chart prices are not imported into valuations. |
| Multiple credit cards | Each has its own debt, APR, minimum, planned payment, due date and payment-plan summary. | Debt is still a design prototype, not a released saved-account type. |
| Financial overview | Adds every asset and debt account; income uses each recorded income assumption. | Market movement changes estimated value, not recorded dividend income or debt. |
| Security and devices | Expandable section shows where existing password, original recovery-code and four-device management belong. | These settings are not wired to the profile prototype; no real credentials are collected. |

The saved Drip model already stores an [account collection](https://github.com/devcamos/drip/blob/a11236b92208ceb2834e68eee314054113b37bef/lib/types.ts), [generates a distinct account ID](https://github.com/devcamos/drip/blob/a11236b92208ceb2834e68eee314054113b37bef/app/AccountForm.tsx) and [appends/updates by ID](https://github.com/devcamos/drip/blob/a11236b92208ceb2834e68eee314054113b37bef/app/Drip.tsx). There is no one-stock restriction. The earlier debt prototype did have one fixed sample; this iteration replaces that assumption with an independent in-memory collection. It does not claim persisted or cloud-synced debt support.

## Reasons for the design

- An avatar is the conventional entry to personal settings. Signing out should be a clearly labelled choice inside it, not an unexpected result of tapping initials.
- Reuse existing login, recovery and device management when applying the design; avoid introducing another authentication flow through this prototype.
- Identify accounts by ID, not by their category or provider. Someone can have multiple holdings or multiple credit cards, including from the same provider.
- Aggregate amounts internally in pennies. Preserve each holding's cost/income basis when a different market price is applied; never count debt as income.
- Keep prototype actions explicit and temporary. No real account, financial record, browser-storage setting or feedback submission is written here.

## Screenshots

Mobile390×844, desktop1440×1000 and narrow320×812 captures use synthetic data. The running optimized build, source commit, fixture boundaries and screenshot hashes are recorded in `profile-verification.json`. Mobile dialogs scroll; the lower settings capture includes the actions below the first viewport.

| State | Mobile | Desktop |
| --- | --- | --- |
| Profile and income preference | [Profile](profile-settings-mobile.png) | [Profile](profile-settings-desktop.png) |
| Security explanation and explicit sign-out | [Lower settings](profile-settings-actions-mobile.png) | [Lower settings](profile-settings-actions-desktop.png) |
| Two holdings and two credit cards | [Account stack](profile-multiple-accounts-mobile.png) | [Account stack](profile-multiple-accounts-desktop.png) |
| Second holding's own value and statistics | [Digital Realty](profile-second-holding-mobile.png) | [Digital Realty](profile-second-holding-desktop.png) |
| Independent second credit-card statement | [Lloyds editor](profile-second-credit-mobile.png) | [Lloyds editor](profile-second-credit-desktop.png) |
| Counts after adding accounts | [Updated profile](profile-multiple-counts-mobile.png) | [Updated profile](profile-multiple-counts-desktop.png) |

## Verification

Application source: `a11236b92208ceb2834e68eee314054113b37bef`. The new suite contains **7 isolated unit / 2 component integration / 1 critical browser case**, matching70/20/10. The first visual pass found that long tickers overflowed their icon tiles; a one-letter monogram fixes both tiles while the full ticker remains beside the stock name. The new regression assertion failed before this fix and passed afterward. There is no primary datastore in this prototype; the integration cases exercise React composition and shared state, and do not claim real account persistence.

| Check | Expected result | Evidence / observed result |
| --- | --- | --- |
| Initials / preferences / sign-out | Settings opens without navigating to sign-in; preference affects Accounts; sign-out is explicit. | Component and critical browser checks passed; native focus/scroll and the settings states were visually checked at1440/390/320px. |
| Multiple-account isolation | Separate chart identities, statement edits and prices; other accounts unchanged. | Unit, component and actual-browser checks passed: Digital Realty and Realty Income keep separate values; Lloyds edits leave Barclaycard unchanged. |
| Totals and recorded income | Additional assets/debts affect the overview; entered price changes only the selected value. | Unit/component checks passed, including stale FX fallback and penny rounding. |
| Full application regression | Preserve existing test/coverage gates, including real local Postgres/HTTP contracts. | 814 unique passes:202 unit,512 component/storage integration,33 real local Postgres/HTTP and67 browser. All14 required local-cloud journeys ran; three historical PWA journeys remain conditional. [Executed report](../../testing/regression-report.md). |
| Optimized mobile / desktop UI | Native dialog focus/scroll, no overflow, no page exceptions or unintended writes. |18 states captured and visually inspected at1440×1000,390×844 and320×812; no exceptions or overflow; no financial/auth/feedback writes or browser-storage changes. |
| Hosted Git Preview | Same behaviour on the deployed PR head. | The exact deployment SHA, returned CI checks and hosted result are recorded with the PR at handoff. Local screenshots alone do not establish hosted behaviour. |

The local stock-value and automated browser checks use synthetic FX0.75 and a chart transport fixture; they are not evidence of current market data. Coverage: 97.62% lines, 92.73% branches, 94.06% functions and 94.74% statements. Types, boundaries, optimized build and audit0 passed. Physical iOS/PWA interactions remain unverified. Password/recovery changes, live customer data, persisted debt, migrations and Production release are outside this prototype.

## Next steps

1. Try the avatar and add a second holding/card. Review the settings sections, account stack and separate payment plans.
2. Agree which profile settings should be visible initially. Connect the existing authentication/device controls when applying the agreed design to the real account settings.
3. Implement the agreed saved-debt model, validation and cloud/backup compatibility in a separately reviewed change, with real persistence and restore tests. The prototype account collection is not a migration.
4. Follow the [feedback/C4 discussion](feedback.md) for the separate feedback engine decision. No feedback delivery has been enabled by this change.
