# Design note: reserving gamertags on the server (#13)

Status: **proposal, waiting for Devonte's yes.** No code, schema or migration is in this PR.

## Why this stops at a design note

Every option that meets #13 needs a new server table, so it needs a database migration. The agent rules say migrations need the maintainer's explicit yes.

- `drip_password_login.username` is already unique and lower-case, but only for accounts that use password sign-in. It can't hold a suffix (`CHECK username ~ '^[a-z0-9_]{3,16}$'`) and has no row for passkey-only or local-only identities.
- Nothing else on the server stores `identity.id`, a handle or a suffix. The local `Identity` record (`lib/identity.ts`) is device-only.

## Proposed schema (one additive migration)

```sql
CREATE TABLE IF NOT EXISTS drip_handle (
  identity_id uuid PRIMARY KEY,
  user_id     text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  handle      text NOT NULL CHECK (handle ~ '^[A-Za-z0-9_]{3,16}$'),  -- as typed, for display
  handle_key  text GENERATED ALWAYS AS (lower(handle)) STORED,       -- Devo = devo
  suffix      text CHECK (suffix ~ '^[0-9]{1,4}$'),
  released_at timestamptz,                                           -- set on rename; cooling-off
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One live owner per handle+suffix, case-insensitive. Released rows keep the name until the cooling-off ends.
CREATE UNIQUE INDEX IF NOT EXISTS drip_handle_live ON drip_handle (handle_key, coalesce(suffix, '')) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS drip_handle_limits (key text PRIMARY KEY, bucket timestamptz NOT NULL, hits integer NOT NULL);
```

It's additive only, with no change to existing tables or rows, and it stores only the id, handle and suffix (no personal data), as #13 asks.

## Endpoint

`POST /api/identity/handle` with `{ identityId, handle }`. Requires a signed-in Better Auth session, and same-origin checks as the existing `/api/cloud` routes.

1. Validate with `handleError()` and the optional block list (reserved words such as `admin`, `drip` and `support`, plus an offensive-word list).
2. Rate limit per user and IP, reusing the `drip_*_limits` bucket pattern (for example 10 attempts an hour).
3. In one transaction, try `INSERT … ON CONFLICT DO NOTHING` with no suffix. If that row is taken, retry with `randomSuffix()` (1–4 digits) up to N times. The unique index makes this atomic under concurrent signups.
4. Return `{ handle, suffix }`. The client stores it with `withSuffix()` and shows "devo was taken, so you're devo#4821", with a button to pick a different handle instead.

## Ownership

- **Recommended (v1.1):** bind `identity_id` to the signed-in Better Auth `user_id` (UNIQUE above). Only that session can change it. This reuses the existing passkey and password auth with no new crypto.
- **Issue's stronger option:** require a WebAuthn assertion over `{identityId, newHandle, nonce}` for renames. This adds a challenge endpoint and more tests, so it should be a follow-up.

## Renames and restore

- Rename sets `released_at = now()` on the old row and inserts a new one. A nightly job (or a lazy check on insert) frees released names after 30 days.
- Restoring a backup with the same `identity.id` on a new device signs in to the same account and gets the same row back. Restoring under a different signed-in user is refused, and the app asks the user to sign in to the original account.

## Tests this would add

- **Postgres:** a case-insensitive clash gives a suffix; 50 concurrent reservations of one handle get unique suffixes; a released handle is held until the cooling-off ends; rate limit; another user can't take over an `identity_id`.
- **Unit:** block list, retry loop and response mapping.
- **UI:** a "was taken, so you're …" message, and picking a different handle.

## Decision needed from Devonte

1. Approve the additive `drip_handle` and `drip_handle_limits` migration (preview database first, then production after merge).
2. Choose session-bound ownership for now, or a passkey signature from day one.
3. Confirm a 30-day rename cooling-off and whether to ship the block list in v1.1.
