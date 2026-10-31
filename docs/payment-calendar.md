# Expected payment calendar

Open the bell → **Payment calendar** to see recurring interest and dividend
dates over the coming twelve months. Today's payments remain in the existing
Today panel; the calendar runs from tomorrow through the day before the same
date twelve months later. A rolling window can span thirteen partial/full
calendar-month headings; its exact date range is shown.

Every date is derived locally from the account's **Next payout date** and
**Paid** frequency. Edit those fields through the account's existing editor to
recalculate the entire schedule. Like the existing reminders, the calendar
includes earning accounts with a positive balance/yield and a valid schedule.
Monthly, quarterly and yearly dates are always
calculated from the original anchor. For example, 31 January projects to
28/29 February and then 31 March, retaining the intended month-end pattern.
No holiday or company-announcement adjustments are inferred: dates are expected
and should be checked against the provider's declared payment dates.

Daily schedules are grouped into one row per account/month with the inclusive
date range and number of daily payments. Counts use actual calendar days,
including leap days, and respect future schedule start dates. This avoids a
large row for every day of every account.

Amounts use the existing payout estimate from the current recorded balance,
annual yield and frequency. Daily amounts are aggregated for the displayed
range; rows are rounded to pennies and monthly totals sum those displayed
amounts. These projections assume no compounding, balance/rate changes or
one-off bonus payments. They are separate from the received-income ledger.

Generating, expanding or viewing the calendar never creates payout records,
updates balances or changes saved data. Only an explicit user edit changes an
account's stored schedule. Received-income and portfolio totals continue to
use actual recorded payments. No API, phone permission, database migration,
new stored field, background job or new phone subscription is required; the
existing phone-reminder schedule remains unchanged.

Verification: `tests/payment-calendar.test.ts`,
`tests/payment-calendar-ui.test.tsx`, `e2e/payment-calendar.spec.ts`.
The browser test exercises the real local application/encryption, date/frequency
editing, future schedule recalculation, unchanged received income and encrypted
reload. [Screenshots](screenshots/payment-calendar/README.md) use synthetic
accounts, without API-response mocks or real customer credentials.
