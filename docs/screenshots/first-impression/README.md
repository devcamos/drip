# First-impression prototype

Open `/prototype/welcome` on a Preview or local deployment. The route returns 404 on a Production build and is excluded from search indexing. The current sign-in and Accounts implementation is separate from this design experiment.

Use **Sign in**, **First account** and **With accounts** above the product canvas to compare the entry states. Try the demo entry, first-account chooser, account-card expansion, monthly/yearly estimate and optional Home Screen reminder. **Reset demo** restores the initial sample state.

The sign-in fields are read-only samples. Interactions use component state: they do not authenticate, connect providers, change saved accounts or persist edits. Recorded values and estimates are labelled separately from received income. Sample prices and payment dates are illustrative.

## Screenshots

Captured from running optimized builds, using DM Sans and synthetic data. Before: main `ba88e23996586090bb6f3527028d6c446ca8e335`. After: prototype source `d4748729aafe8114dc15be4706655d09b118da86`. The following evidence commit adds only these screenshots/documentation; application and test source match the tested prototype commit.

| State | Before mobile | After mobile | Before desktop | After desktop |
| --- | --- | --- | --- | --- |
| Sign in | [Current](before-signin-mobile.png) | [Prototype](after-signin-mobile.png) | [Current](before-signin-desktop.png) | [Prototype](after-signin-desktop.png) |
| First Accounts | [Current](before-empty-mobile.png) | [Prototype](after-empty-mobile.png) | [Current](before-empty-desktop.png) | [Prototype](after-empty-desktop.png) |
| Example Accounts | [Current](before-accounts-mobile.png) | [Prototype](after-accounts-mobile.png) | [Current](before-accounts-desktop.png) | [Prototype](after-accounts-desktop.png) |

Additional states: expanded card [mobile](after-expanded-mobile.png)/[desktop](after-expanded-desktop.png), account chooser [mobile](after-chooser-mobile.png)/[desktop](after-chooser-desktop.png), and install details [mobile](after-install-mobile.png)/[desktop](after-install-desktop.png). Chooser captures show the viewport; other captures show the full page.

Main comparisons use 390×844 mobile and 1440×1000 desktop. The prototype was also captured and checked at 320px with no horizontal overflow. The Accounts baseline uses an encrypted synthetic legacy fixture with recovery still pending; normal signup after saved recovery codes would usually hide that recovery task. These images do not establish successful hosted authentication or physical-phone behavior.

## Verification

The complete regression command passed 753 unique cases: 159 unit, 500 component/storage integration, 33 real Postgres/HTTP integration and 61 browser cases. Line coverage 97.47%; existing thresholds remain. Three historical old-build PWA journeys remain conditional and are not counted as passes. Clean install, audit, types, dependency boundaries and optimized build passed.

The new cases cover the Production route boundary, noindex metadata, sample-state interactions, separated recovery, estimates versus received payments, native Escape/focus restoration, touch targets, responsive overflow and the absence of account/API/storage writes. They extend the existing design-prototype feature; UI wiring is classified as integration rather than invented business-unit coverage.

Use the prototype to judge warmth, readability, information priority and the amount of card depth. A future application redesign can follow the selected treatment after feedback.
