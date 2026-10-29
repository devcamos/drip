# Signed-in device management

When password login reaches the two-device limit, **Manage devices** lets the
user inspect existing sign-ins, explicitly sign out an old one, and continue
signing in here. The same panel is available from Settings → Signed-in devices
after password confirmation. The cap stays at two browsers/devices; Safari and
an installed Home Screen app may occupy separate slots.

Names are estimates from the session's browser information. Dates mean **signed
in**, not last activity. Only a safe display name, session identifier, sign-in
time and current-browser flag are returned: no tokens, IP addresses, raw user
agents, financial data or encrypted root/password wrappers.

## Security and data behavior

- Both management actions require the normal gamertag password proof, even
  when an authenticated cookie exists. They issue no new session or cookie, so
  a user at the cap can still manage the account without a third sign-in.
- The existing login throttles apply. Both POST endpoints use strict schemas,
  same-origin checks and the streamed4KB password-body bound. Success responses
  are `no-store`; old cache-everything workers still block private operations.
- Credentials are verified by Better Auth and rechecked inside the existing
  owner-row transaction lock shared with password reset and login admission.
  A password reset that commits first invalidates an earlier verified proof.
- SQL uses the verified owner and parameters. Revocation removes only that
  owner's selected browser's tokens, or one legacy session without a browser
  identifier. Expired/already-removed entries are handled idempotently.
- Revoked cookies lose server access. Local/offline encrypted copies are not
  erased. Anyone who still knows the password can sign in again: this is session
  revocation, not a permanent physical-device ban or remote wipe. Existing local
  unsynced-data/account-switch safeguards are retained.
- Removing this browser also uses the existing local sign-out flow. The password
  is held only in component memory during management and cleared on close or
  successful sign-in; neither it nor its proof is persisted by this feature.

The implementation uses existing auth/session tables and settings. **No new
database migration, dependency, key or permission is required by the feature.**
Each new Vercel Preview branch still needs its normal isolated authentication
configuration; older branch-specific settings are not inherited.

## Verification boundaries

`integration/device-management.test.ts` runs real Better Auth HTTP handlers and
Postgres SQL in a fresh schema of the guarded loopback test database. It verifies
third-browser rejection→password-verified listing→revocation→new login, old
cookie invalidation, owner isolation, current-device sign-out, strict payloads
and concurrent revoke/login admission. The schema is removed afterward; no
hosted database is accessed. Node `pg` exercises the compatible SQL surface of
the production Neon Pool without remote credentials.

Unit tests cover password-reset rechecks, body/origin bounds (including stable
Preview origin), signed-out generation checks, client proof handling and the UI.
The browser journey uses synthetic API responses but runs the actual client,
password crypto, encrypted IndexedDB and rendered screens; it separately verifies
confirmation/cancel, sign-in continuation, retained sample balance and Settings.
It does **not** establish hosted or physical-iPhone behavior.

[Screenshot evidence](screenshots/device-management/README.md).
