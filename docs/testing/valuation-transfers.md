# Transfers after a stock price estimate

Review of the saved-account release found that adding or withdrawing cash after
applying a share price removed the recorded dividend-income basis. A market
gain could then incorrectly become additional forecast income.

| Action | Holding value | Recorded income basis | Annual estimate at5.4% |
| --- | --- | --- | --- |
| Record holding | £2,500 | £2,500 | £135.00 |
| Apply a price estimate | £3,750 | £2,500 | £135.00 |
| Withdraw £100 | £3,650 | £2,400 | £129.60 |
| Then add £50 | £3,700 | £2,450 | £132.30 |

Transfers now preserve the quote, FX date, shares and purchase cost while
adjusting the recorded basis by the cash amount. An explicit provider-balance
replacement still establishes a new baseline. The UI explains when transfers
are included in the saved price estimate; calculations stay inside the app.

Validation reconciles the quote with cash entries saved after its matching
balance event. Saved order handles backdated dates. An older valid estimate
without that anchor gets an anchor on its first transfer. Invalid dates,
unanchored mismatches, unsafe amounts and inconsistent totals are rejected.
The existing encrypted format and database version are unchanged.

## Regression evidence

- [Unit cases](../../tests/saved-experience.test.ts) check the example above,
  deposits, backdated dates, penny rounding, revaluation, provider replacement,
  unchanged cost/shares/payouts and rejected invalid ledgers.
- [Storage integration](../../tests/saved-experience.integration.test.tsx)
  round-trips the adjusted basis through real IndexedDB, Web Crypto, backup
  encryption and the cloud-client contract. The primary datastore is not mocked.
- [Critical browser path](../../e2e/saved-experience.e2e.spec.ts) applies a price,
  withdraws, checks income, reloads the encrypted record and restores the adjusted
  recorded value. Other holdings retain their figures.
- A negative control temporarily restoring the original shared balance handler
  produced two failing unit regressions; restoring the fix passed them.

Focused local verification:48 unit cases,13 integration cases and4 browser
journeys passed before the additional defensive unit case. The final focused
valuation coverage check includes that case. The primary feature suite has
32 unit,8 integration and4 browser cases (approximately73/18/9). Full current-head
CI, coverage and hosted status are recorded in the PR; the earlier856-test
release baseline is separate evidence, not a new run of this repair.

## Release boundary

This repair targets the saved-account feature branch first. It does not migrate
SQL, change secrets or access Production customer records. Its separate merge
approval is required before the parent release can proceed.
