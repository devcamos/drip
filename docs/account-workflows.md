# Safer account maintenance

This change implements the six findings from the Sentinel exploratory review:

| Area | Result | Reason |
| --- | --- | --- |
| Actual balance changes | Top-up, withdrawal and replacement dates must be today or earlier; invalid dates are rejected in the UI and mutation. | A future entry must not become today's money. Existing future entries are flagged for provider-led correction, without silently rewriting balances. |
| Stock cash movements | A cash transfer retains the recorded shares and cost, but pauses another price application and capital-return display until the user checks the share details. | A withdrawal is not automatically a sale. The user can confirm unchanged shares or enter their provider's remaining quantity, average cost and value; a fully sold holding can be zero shares/zero value. Received dividends are retained. |
| Unsaved work | Financial forms register their dirty state; navigation and page exit warn, the header says Unsaved changes, and explicit cancellation discards the draft. | A tab tap should not silently lose an edit or imply that an unsaved value was stored. Cancelling a later delete confirmation keeps the dirty warning. |
| Credit-card statements | Due/overdue reminders and one calendar entry use the recorded statement date. Paid statements can be marked and reopened. | Statement repayments are separate from income. Future statements are not guessed. Marking paid does not pay a bank or alter the saved debt; entering the next due date starts its reminder. |
| Archived accounts | Archive removes an account from active totals, forecasts and reminders while preserving received income, transfer history and the complete encrypted record. Settings offers restore or clearly described permanent deletion. | Closing a holding should not require deleting its dividend history. |
| Phone reminders | One-off statement schedules use the existing private push transport. Required-push deployments fail preflight when configuration is missing. | Passing a fallback-message test does not establish deployed capability or physical phone delivery. |

The [payment reminder setup](payment-notifications.md) remains the deployment guide. Use distinct Preview keys and verify the isolated Preview before a separately approved Production rollout. Vercel's automatic Cron executes on Production; Preview dispatch checks are manual and must be labelled as such.

## Preservation and compatibility

`archivedAt`, `positionReviewRequired` and a paid-statement flag are portable encrypted financial metadata. Copies containing these fields use cloud/backup envelope version4; older v1–v3 copies remain readable. The original recovery-code wrapper stays version1. Password/recovery derivation, vault keys and auth policies are unchanged.

IndexedDB schema4 preserves the existing store and ciphertext while refusing older schema3 writers. Frozen v3 entry-point regressions test this guard. Their shared dependencies point at current modules, as documented in the fixture; they are not represented as a complete frozen historical client. Real HTTP/Postgres tests cover authenticated version4 persistence and stale-write rejection.

See [regression evidence](testing/account-workflows.md) and [screenshots](screenshots/account-workflows/README.md).

## Next steps

1. Complete authorized Preview push configuration, then verify a consenting installed device's permission, receipt, banner/tap and a scheduled reminder. Server acceptance alone is insufficient.
2. Obtain release approval with current-head CI, hosted Preview acceptance and the remaining device boundary explicitly stated.
3. Keep future changes mapped in the regression catalog and preserve the existing coverage thresholds and conditional-check reporting.
