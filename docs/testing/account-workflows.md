# Account workflow regressions

The first four domain regressions failed on the pre-fix source: future top-up, withdrawal and balance replacement were accepted, and another share-price application overwrote a withdrawn holding without a share review. The dirty-form integration also failed before the navigation guard because the header still said Saved on this device.

The fixes use isolated business tests for date boundaries, archival totals/history, version selection, portable metadata and one-off statement scheduling. Component integration tests use actual in-memory IndexedDB and Web Crypto, not a mocked primary datastore. Supporting native Postgres tests exercise the application SQL, authenticated HTTP/cloud boundaries and one-off dispatch.

| Primary suite | Layer | Cases |
| --- | --- | --- |
| `tests/account-workflows.test.ts` | Unit, mocked clock | 24 |
| `tests/account-workflows.integration.test.tsx` | Components + actual IndexedDB/Web Crypto | 9 |
| `e2e/account-workflows.e2e.spec.ts` | Critical browser journeys | 3 |

The primary distribution is approximately67%/25%/8%, inside the existing70/20/10 policy tolerance. Existing supporting suites retain their actual runner layers; the legacy app-wide distribution is not relabelled to manufacture a pyramid.

Coverage includes:

- Future-date rejection, today/past acceptance and source immutability.
- Share review after a cash withdrawal; another quote cannot restore the previous quantity without confirmation.
- Draft retention when navigation is cancelled, truthful status, explicit discard, and a cancelled secondary Delete confirmation.
- Projection drafts stay protected while their controls are collapsed. A successful persisted save resets the draft baseline so unchanged reopening does not produce a false warning. Both additional regressions failed before the Sentinel review fixes.
- Archived income retention, removal from active money/forecasts/reminders, restore, encrypted backup/cloud round-trips and frozen v3 write fences.
- Credit-card dates today/overdue/future, settled and zero-balance statements, a zero planned payment with a positive minimum, one-off expiry, privacy and repayment/income separation.
- One-off schedule schema validation and native Postgres delivery advancement without inventing a next statement.
- Generic worker notification wording suitable for both incoming payments and repayments, with no account details on the lock screen.

Run `npm run test:regression` with the existing disposable loopback database to execute types, dependency boundaries, all coverage projects, build, local browsers and required real-cloud browser contracts. Run `npm run audit` separately. Do not count the three inherited older-build conditional journeys as passing checks.

The new local browser cases intercept remote APIs explicitly; they establish rendering, edit behaviour and real encrypted browser persistence, not hosted push delivery. Hosted account journeys and actual phone installation/receipt need separate evidence.
