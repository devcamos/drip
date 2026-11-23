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

`archivedAt`, `positionReviewRequired` and a paid-statement flag are portable encrypted financial metadata. Integer-pence financial storage is version5; older v1–v4 copies remain readable and are upgraded when saved or synced. The original recovery-code wrapper stays version1. Password/recovery derivation, vault keys and auth policies are unchanged.

User-confirmed account figure review dates are portable encrypted metadata in format v6. The client reads v1–v5 as before and writes v6 once review dates are present, so clients that do not understand these fields reject the copy instead of silently dropping review history. There is no SQL migration: review dates travel inside the encrypted account payload. New account details or edits mark only the figures changed; explicit review confirms the displayed figures. Review reminders are local to each saved account and do not verify provider data.

IndexedDB schema5 preserves the existing store while moving the local encrypted payload from pounds to integer pence. On unlock, local-envelope v1 data is decrypted as pounds, normalized and verified, then committed as envelope v2 pence. Schema5 refuses older schema4 writers before they can mistake pence for pounds. New backups and cloud envelopes use version5; restore and sync still read v1–v4 and convert their pounds values. Money remains pounds at the UI and business-logic boundary. Balances, payment/event history, card minimum and planned payments, recorded market valuations, snapshots and projection deposits are stored as integer pence; share counts, per-share prices, APR, FX rates and dates retain their units. Older history receives deterministic event IDs during migration, and new balance/income entries use stable IDs so retrying the same withdrawal or payment is idempotent. Frozen v3 entry-point regressions test the previous storage guard. Their shared dependencies point at current modules, as documented in the fixture; they are not represented as a complete frozen historical client. Real HTTP/Postgres tests cover authenticated versioned persistence and stale-write rejection.

See [regression evidence](testing/account-workflows.md) and [screenshots](screenshots/account-workflows/README.md).

## Next steps

1. Complete authorized Preview push configuration, then verify a consenting installed device's permission, receipt, banner/tap and a scheduled reminder. Server acceptance alone is insufficient.
2. Obtain release approval with current-head CI, hosted Preview acceptance and the remaining device boundary explicitly stated.
3. Keep future changes mapped in the regression catalog and preserve the existing coverage thresholds and conditional-check reporting.
