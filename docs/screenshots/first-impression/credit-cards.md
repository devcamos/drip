# Credit-card prototype

**No accounts yet** means the empty financial-account list after signup. It is a prototype state to compare with **Your accounts**, rather than a special account product or an extra signup step.

At `/prototype/welcome`, select **Your accounts**, open **Barclaycard**, then choose **Edit credit card**. The example captures an amount owed, APR, statement minimum, optional planned payment and statement due date. Minimums are entered from the provider’s statement for that due cycle; different providers can calculate them differently.

The sample reconciles £7,500 of savings/investments, £1,200 owed and a £6,300 net position. Its asset income remains £340 estimated annually, or £28.33 average monthly. Changing a plan does not reduce a recorded balance, record received income or schedule a payment. Only changing the recorded amount owed changes the debt/net figures.

The fields accept a 0% APR and an unset plan. Amount mismatches remain visible with review notes; no values are silently clamped. APR alone is not used to promise exact interest charges or a payoff date. Changes use memory-only sample state and Reset demo restores the starting figures.

## Screenshots

Credit/editor captures use the running optimized prototype at source `98b208e6a6673f83449ab01c1ec039aaf4eeff6f` (app identical to `9e5a024`); overview links use the later combined prototype capture at `032e4f4`. Images use synthetic data and mobile 390×844/desktop 1440×1000 viewports. Narrow 320px states were also checked. Native date fields follow the browser’s formatting; the recorded sample date is 20 November 2026.

| State | Mobile | Desktop |
| --- | --- | --- |
| Money, debt and net overview | [Overview](after-accounts-mobile.png) | [Overview](after-accounts-desktop.png) |
| Expanded credit card | [Card](credit-mobile.png) | [Card](credit-desktop.png) |
| Editable statement and plan | [Editor](editor-mobile.png) | [Editor](editor-desktop.png) |

[Scrolled mobile editor](editor-scrolled-mobile.png) · [Below-minimum plan note](plan-note-mobile.png)

The Save/Cancel row stays visible while fields scroll. Keyboard checks preserve native Escape/focus behavior and verify that the due-date field can be reached without being covered by the sticky actions. Date editing is exercised separately from editor dismissal, since a native mobile picker handles its own Escape.

## Verification scope

The new feature has 14 isolated unit, four component integration and two browser cases, exactly 70/20/10. These cover financial separation, pennies, zero/optional values, statement edits, validation, review notes, reset, keyboard behavior and sample-data isolation. They extend the existing app-wide gates; the legacy app test distribution is not relabelled.

The route remains Preview/development only and noindex. This prototype does not change saved-account formats, authentication, cloud records or Production behavior. Applying the chosen design to saved accounts is a later step after feedback.
