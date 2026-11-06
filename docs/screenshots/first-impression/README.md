# First-impression prototype

Open `/prototype/welcome` on a Preview or local deployment. The route returns 404 on a Production build and is excluded from search indexing. The current sign-in and Accounts implementation is separate from this design experiment.

Use **Sign in**, **No accounts yet** and **Your accounts** above the product canvas to compare the entry states. The empty state simply means no financial accounts have been added. Try the sample chooser, card expansion, credit-card editor, monthly/yearly estimate and optional Home Screen reminder. **Reset demo** restores the initial sample state. See the [credit-card walkthrough](credit-cards.md).

The sign-in fields are read-only samples. Account and credit-card edits use component state: they do not authenticate, connect financial accounts, change saved records or persist edits. Money, credit-card debt and net position are shown separately; plans and estimates stay distinct from received income. Recorded figures and payment dates are illustrative. The optional [share-price view](stock-prices.md) makes a separate TradingView connection only when requested.

## Screenshots

Captured from running optimized builds, using DM Sans and synthetic recorded data. Before: main `ba88e23996586090bb6f3527028d6c446ca8e335`. After: prototype/test source `032e4f4450c9fbd98b22f780fcdaae8b99c6c784`. The evidence follow-up changes only screenshots/documentation; application and test source match that tested commit.

| State | Before mobile | After mobile | Before desktop | After desktop |
| --- | --- | --- | --- | --- |
| Sign in | [Current](before-signin-mobile.png) | [Prototype](after-signin-mobile.png) | [Current](before-signin-desktop.png) | [Prototype](after-signin-desktop.png) |
| No accounts yet | [Current](before-empty-mobile.png) | [Prototype](after-empty-mobile.png) | [Current](before-empty-desktop.png) | [Prototype](after-empty-desktop.png) |
| Your accounts | [Current](before-accounts-mobile.png) | [Prototype](after-accounts-mobile.png) | [Current](before-accounts-desktop.png) | [Prototype](after-accounts-desktop.png) |

Additional states: expanded card [mobile](after-expanded-mobile.png)/[desktop](after-expanded-desktop.png), account chooser [mobile](after-chooser-mobile.png)/[desktop](after-chooser-desktop.png), and install details [mobile](after-install-mobile.png)/[desktop](after-install-desktop.png). Chooser captures show the viewport; other captures show the full page.

Main comparisons use 390×844 mobile and 1440×1000 desktop. The prototype was also captured and checked at 320px with no horizontal overflow. The Accounts baseline uses an encrypted synthetic legacy fixture with recovery still pending; normal signup after saved recovery codes would usually hide that recovery task. These images do not establish successful hosted authentication or physical-phone behavior.

## Decisions and reasons

| Choice | Reason | Detail |
| --- | --- | --- |
| No accounts yet | Explains an empty list of financial accounts after signup. It is a comparison state, not another account type or signup step. | [Entry states](../../../app/prototype/welcome/WelcomePanels.tsx) |
| Separate money, debt and net position | A credit-card balance is an amount owed. It should reduce net position without being mixed into savings or dividend income. | [Debt calculations](../../../app/prototype/welcome/credit-card.ts), [walkthrough](credit-cards.md) |
| Statement minimum and planned payment | Capture what the issuer requests and what the user plans independently. Providers can use different minimum formulas. Neither field makes a payment. | [Editable statement](../../../app/prototype/welcome/CreditCardPreview.tsx) |
| Estimated versus received income | A prediction is useful without claiming a payment has arrived. | [Accounts view](../../../app/prototype/welcome/AccountPreview.tsx) |
| Optional Home Screen task | Installation is a useful next action, with details available when wanted. It does not guarantee data retention. | [Install state](../../../app/prototype/welcome/WelcomePanels.tsx) |
| Optional market chart | A free display widget provides price-history context while recorded holdings and income stay independent. An automatic valuation needs a different data contract. | [API comparison and stock view](stock-prices.md) |

## Verification

The combined prototype passed the complete `npm run test:regression` on source `032e4f4`: **783 unique cases** (180 unit, 506 component/storage integration, 33 real Postgres/HTTP and 64 browser). Coverage: **97.54% lines, 92.34% branches, 94.01% functions, 94.55% statements**. Types, dependency boundaries, optimized build and audit passed; existing thresholds remain. See the [executed report](regression-report.md) and separate [real-provider verification](stock-prices.md#verification).

| Behaviour | Expected and observed | Where / evidence |
| --- | --- | --- |
| Entry and empty-list navigation | Sign in, empty list and example accounts stay separate; sample choices open the matching card. Passed. | Local running app and [component interactions](../../../tests/welcome-prototype.integration.test.tsx), [browser journey](../../../e2e/welcome-prototype.e2e.spec.ts) |
| Debt and income arithmetic | £7,500 money minus £1,200 owed gives £6,300 net. Editing only the plan leaves debt, money and income unchanged. Passed, including zero and negative-net cases. | [14 isolated units](../../../tests/credit-prototype.test.ts), [four component integrations](../../../tests/credit-prototype.integration.test.tsx) |
| Credit editor | Fields save/cancel/reset correctly; Save stays visible, due-date field is reachable, Escape returns focus. Passed. Native date-picker dismissal is checked separately from editor dismissal. | Optimized Chromium at mobile/desktop sizes; [two browser cases](../../../e2e/credit-prototype.e2e.spec.ts), [editor evidence](credit-cards.md#screenshots) |
| Preview boundary and data isolation | Production route returns 404 and robots metadata excludes indexing. Sample edits do not call account APIs or persist records. Passed. | [Route tests](../../../tests/holdings-prototype-route.test.tsx), component and browser checks above |
| Layout | No horizontal overflow at 320, 390 and 1440px; important captures visually inspected. Passed. | Screenshots above and [credit-card states](credit-cards.md#screenshots) |

Three inherited historical old-build PWA journeys remain conditional, not passes. This prototype evidence does not verify a physical iPhone, hosted account login or real customer balances. Full regression reports distinguish real Postgres/HTTP tests from sample UI fixtures.

## Next steps

1. Open `/prototype/welcome` in Preview. Compare **No accounts yet** with **Your accounts**; edit Barclaycard's minimum and plan, then use **Reset demo**.
2. Try the [stock-price sample](stock-prices.md) from the Realty Income card. The recorded holding and external chart have separate sources and currencies.
3. Give feedback on information priority, card depth and payment-plan wording. The screenshot comparison section remains the visual reference.
4. Apply the agreed design to saved accounts in a later implementation. This prototype does not authorize a Production rollout or change persisted account formats.
