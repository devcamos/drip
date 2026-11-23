# API incident reporting

Drip's App Router API handlers use a shared server error boundary. Responses
below HTTP 500 are left alone. A 5xx response or uncaught handler exception is
written to the Vercel function log with a correlation reference and can be sent
to Slack `#incidents` when the deployment has a webhook configured.

## Privacy and delivery

Each event contains the deployment environment, HTTP method, a static route
label, response status, error class, a coarse error category and a short one-way fingerprint. It does
not contain request or response bodies, query strings, cookies, headers,
credentials, account values, recovery material, raw exception messages or
stack traces. The category distinguishes database, network, timeout,
authentication and unclassified failures without exposing exception text. The
response includes `x-drip-incident-reference`; unexpected
exceptions also return that reference in a generic JSON error so support can
correlate the user report with the function log.

Only HTTPS Incoming Webhook URLs on `hooks.slack.com/services/` are accepted.
The send has a 1.5-second timeout. Delivery errors are logged by reference and
never replace or suppress the original 5xx response. Missing or invalid
configuration disables delivery without affecting API availability. 4xx
validation, authentication and rate-limit responses do not alert.

## Preview setup

1. Create or select a Slack Incoming Webhook connected to `#incidents`.
2. Add it as the secret `DRIP_INCIDENT_SLACK_WEBHOOK` to the Drip Vercel
   **Preview** environment. Keep it server-side; never use a `NEXT_PUBLIC_`
   variable or place it in GitHub comments, fixtures or test output.
3. Deploy a Preview build and verify function logs and the Slack message use the
   same correlation reference and include only the documented fields.
4. Remove the secret or revoke the webhook if it appears in output or is sent
   to an unintended channel.

This change does not access or configure Production secrets. Checkly synthetic
journey alerts remain separate: Checkly detects a user-visible login failure,
while this boundary reports server-side 5xx responses. Both may be routed to
`#incidents`; correlate them by deployment and timestamp, not by user data.
