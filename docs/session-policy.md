# Drip session policy

Drip is a manually maintained income tracker, without payment or trading
instructions. These are product-specific security choices, not a claim that a
seven-day timeout satisfies every bank, regulatory regime or assurance level.

## Cloud sign-in

- A newly issued Better Auth session lasts **seven days**. It is remembered
  across browser restarts through a host-only, HttpOnly cookie. HTTPS deployments
  use Secure cookies; SameSite=Lax and trusted-origin checks remain enabled.
- **Routine activity does not extend that expiry.** Background sync cannot keep
  the bearer credential alive indefinitely. Explicit successful authentication
  can issue a new session. Previously issued sessions retain their existing
  stored expiry; this change does not delete them or rotate the signing secret.
- **Five-minute freshness** applies to Better Auth endpoints which use its
  fresh-session middleware (including passkey registration). It is not a
  five-minute app logout, nor a freshness check on every custom endpoint.
- Session-cookie caching is disabled: authenticated server checks consult the
  backing session store, so a deleted device session fails the next lookup.
  A request already authorized and in flight can still finish.
- Authentication responses, including session reads and handled failures, send
  `Cache-Control`, `CDN-Cache-Control` and `Vercel-CDN-Cache-Control: no-store`.
  This complements the existing service-worker rule excluding APIs from caches.
- The existing owner-scoped device management and configured **four-device** cap
  remain intact. Device admission, password reset and removal keep their owner
  locks and credential rechecks; an update does not reset the device allowance.
- Password reset revokes other cloud sessions. Device sign-out deletes its
  server session; offline sign-out locks locally and queues remote revocation.

## Local encryption is separate

The cloud cookie grants server access; it is not the key to the local vault.
Passwords, recovery roots and usable vault keys are not saved as plaintext to
keep a browser signed in. Encrypted local records and queued edits survive
server-session expiry, sign-out and app updates.

A still-open, unlocked page stays usable when foregrounded. A full reload,
new tab or browser restart requires its configured password, passkey unlock or
saved recovery code to decrypt the vault. The existing optional screen lock
gates the UI after five minutes in the background. It does not erase in-memory
keys, and is not a server-enforced inactivity timeout.

Remote device removal prevents subsequent cloud access, but cannot erase an
offline copy or a decryption key already obtained. Signing out locally drops
the current page's active keys. A full offline-access revocation system would
require a separate encryption/key-rotation design.

## Why these choices

OWASP recommends finite server-enforced session lifetimes, secure cookies,
reauthentication for sensitive actions and real server-side invalidation. There
is no universal session duration: seven days is Drip's bounded remembered-login
choice. A stricter idle timeout is a separate decision, especially because
background sync must not count as a person's activity. Drip currently has no
mandatory server idle timeout and does not claim a NIST assurance level.

Keep the production hostname, database and auth signing secret stable across
ordinary deploys. Deploying code should not invalidate a valid account or
session. Expiry, explicit sign-out, reset, device removal and browser cookie
deletion are different events and should not be confused with a failed deploy.

## Regression evidence

`tests/session-policy.test.ts` exercises the real pinned Better Auth HTTP handler
and memory adapter with Drip's actual session configuration: persistent HTTPS
cookie attributes, unchanged expiry after activity, expired/deleted/tampered
cookies and sign-out followed by replay of the old cookie. It isolates device
and password plugins; their separate real-Postgres suites cover those flows.
`tests/cloud-api.test.ts` covers no-store headers on success and handled errors
while preserving cookie headers. No hosted or Production account is used.

References:

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management)

The installed Better Auth version and its implementation/tests are the version
authority; an upgrade must rerun these tests rather than assuming defaults stay
unchanged.
