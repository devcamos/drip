# Contextual install task

21 October 2026. Application source `5754811ff9ceb3f98fbd6d32368f7c56564506c9`.
Actual optimized local Drip, Chromium, synthetic `drip_demo` / £3,000 account.
The iOS instruction branch uses an emulated iPhone user agent; screenshots do
not establish that a physical iOS installation occurred. Mobile **390 × 1000**
and desktop **1280 × 1000**. All six images were opened and visually inspected;
no secrets, recovery-code display, customer data or UI mocks.

| Task state | Mobile | Desktop |
| --- | --- | --- |
| Actionable setup guidance | [View](pending-mobile.png) | [View](pending-desktop.png) |
| Brief completion confirmation | [View](complete-mobile.png) | [View](complete-desktop.png) |
| Completed task removed | [View](finished-mobile.png) | [View](finished-desktop.png) |

This pattern is contextual onboarding with progressive disclosure: show a useful
setup task, confirm completion and remove it. Completion and dismissal are
remembered separately in a browser-only, versioned preference. The task does not
change account records, cloud state, encryption or financial exports.

Native `appinstalled` or a standalone display-mode change completes it. Opening
or accepting the native install prompt alone does not. On iOS, the original tab
cannot reliably observe another Home Screen context, so **I've added Drip** allows
explicit confirmation. The completion state remains briefly, fades and unmounts;
reduced-motion users see the confirmation without animation. Dismissal is also
remembered, and an already-installed standalone app does not show the task.

Six focused component cases cover persistent completion, accepted/cancelled
prompts, actual install events, dismissal, errors and standalone detection.
`e2e/install-task.spec.ts` passed against the real optimized app: manual completion,
confirmation/removal, reload and recovery unlock preserve the £3,000 encrypted
account and keep the task absent. Mobile/desktop captures have no horizontal
overflow. Screenshot capture is opt-in with `DRIP_INSTALL_CAPTURE=1`.

The worker, offline shell and caching rules are unchanged. Existing saved-app
update evidence remains linked from [PR23](https://github.com/devcamos/drip/pull/23),
which also records final current-head checks. Physical Safari/Android installation
and native OS prompt behavior remain unverified; events in unit tests are synthetic.
No Production release performed.
