# Remembered-gamertag focus race

The post-merge regression run42456533478 caught a sign-in failure after cancelling
signup. Its existing browser trace showed the saved gamertag twice in the input,
the incorrect-credentials message and no sign-in HTTP request. The combined tag
was too long and was rejected locally. This is a field-prefill race, not evidence
of a rejected server password or lost account records.

The remembered tag arrives asynchronously from local storage. Previously the
field stopped accepting that result only after an input/change event. A browser
can focus and select the field before inserting text; a remembered value arriving
in that gap changes the value/selection, allowing the intended tag to append.

The field now freezes asynchronous prefill on focus. Normal untouched prefill and
the existing typed/password-manager protection remain covered. There is no
password, session, device-limit, database, encryption or rate-limit change.

## Regression

[The component case](../../tests/password-ui.test.tsx) holds the saved lookup
pending, focuses the field, resolves the lookup before the first input event,
then submits the intended tag. It fails on the released code and passes after
the fix. Existing coverage still checks untouched prefill, late typed/autofilled
values, wrong credentials, account replacement and password/passkey setup.

The existing real-Postgres browser journey in
[password-login.spec.ts](../../e2e/password-login.spec.ts) remains unchanged.
No retry, timeout, limiter or success assertion is weakened. The full current-head
CI result is recorded in the repair PR.

## Review boundary

The Production build is serving the approved saved-account design, but its
post-merge test failure prevents declaring the release fully verified. This
isolated follow-up targets main and needs its own direct merge approval under
the release guide. Nicole's email remains unsent. Failure artifacts are synthetic,
kept in operations, and are not published as credential-bearing traces.
