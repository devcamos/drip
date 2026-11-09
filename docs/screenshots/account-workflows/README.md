# Account workflow changes

These captures use synthetic saved accounts with actual browser encryption.

| Screen | Mobile390px | Desktop1280px | Why it changed |
| --- | --- | --- | --- |
| Share position review | [Mobile](share-review-390.png) | [Desktop](share-review-1280.png) | A cash withdrawal should not silently become a stock sale or be overwritten by an unchecked price update. |
| Archived income history | [Mobile](archived-history-390.png) | [Desktop](archived-history-1280.png) | Keep received dividends when an account leaves active totals, and offer a clear restore path. |
| Debt and income reminders | [Mobile](debt-reminders-390.png) | [Desktop](debt-reminders-1280.png) | Show statement dates without counting repayments as incoming income or inventing recurring statements. |

## Verification

The [three browser journeys](../../../e2e/account-workflows.e2e.spec.ts) exercise future-date rejection and cancelled navigation, share review/archive/restore, and debt reminders with paid-state persistence. They also check horizontal overflow at the captured widths. Read the [test evidence](../../testing/account-workflows.md) for domain, real datastore and compatibility coverage.

External APIs are intercepted in these local UI journeys. The phone panel's unconfigured state is a stated fixture condition, not proof of a connected phone or failed Production service. Current Preview activation requires separately approved keys, followed by actual installed-device receipt/banner/tap and scheduled-delivery checks. No customer records or usable credentials appear in the images.

## Next steps

1. Review the saved-account behaviour at the PR's verified Preview.
2. Complete the authorized phone setup and real-device checks before claiming phone delivery is available.
3. Retain the regression cases when evolving these forms, account lifecycles or schedules.
