# Drip

A local-first savings tracker and installable PWA. Nexus colours and self-hosted DM Sans. No real name, email address or phone number is requested.

## Run and test

Node 24. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm start`.
`npm run e2e` exercises mobile Chromium, including an offline reload. This is now a full-stack Next.js app, not a static `out/` export.

## Optional encrypted cloud recovery

Copy `.env.example` to ignored `.env.local`, supply a dedicated environment's database and random auth secret, and set `BETTER_AUTH_URL` to that environment's stable origin. Do not use deployment-specific URLs: storage and passkeys belong to a hostname. Never share Preview database credentials or auth secrets with Production. Run `node --env-file=.env.local scripts/migrate.mjs` against the selected database before starting.

From Backup, enter the saved recovery code and enable encrypted cloud recovery. Add a cloud sign-in passkey. Existing local tracking works without enabling cloud. On a fresh browser/device choose Restore cloud accounts. A passkey authenticates but the recovery code is still needed to decrypt the cloud copy; code-only recovery is also supported. A gamertag is a display label, not an authentication credential or globally unique username.

Cloud authentication uses Better Auth and its passkey plugin. A domain-separated digest of the random recovery code supplies an internal synthetic `.invalid` email identifier and another digest supplies an authentication secret. No mail is sent. The root code is never sent to the server. Server-side authentication still handles security metadata such as rate limiting; this is pseudonymous, not a promise of anonymous financial data.

Cloud payloads use AES-256-GCM with random IVs and PBKDF2-SHA256 (600,000 iterations); the client derives a separate, non-exportable key and stores it in IndexedDB on a trusted device. Local account records themselves remain unencrypted; this change does not claim to encrypt the device database. Backups are encrypted. Losing the code and all trusted devices means losing access to the encrypted copy; there is no administrator decryption/reset.

Local changes and their queued-upload marker commit together. Sync runs on changes, reconnect, returning to the foreground, and periodically while the app is open. It is not a continuously running background service. Failed uploads keep local data. Local writes carry monotonically increasing revisions, and upload acknowledgements atomically preserve any newer revisions. Connection generations prevent a delayed upload from changing a restored/reconnected device. Every private request is bound to an expected account as well as a server session. Every upload uses compare-and-swap versions; a stale device gets a visible conflict and cannot overwrite the cloud copy. This version does not automatically merge accounts or events. Export a local backup before explicitly restoring a newer cloud copy. Expired sessions can be renewed using the code without replacing local accounts. File imports disconnect cloud recovery to prevent accidental cross-account uploads. Device app-lock credentials are excluded from cloud restores.

## PWA lifecycle

Manifest, icons, standalone mode and a service worker support installation. Open the stable URL in Safari → Share → Add to Home Screen, or use the install action in a supporting Android browser. Browser storage can still be cleared; installation is not a backup.

The service worker caches only the public shell, fonts and static assets. Auth/session/vault APIs are never cached. Before authentication or private requests, a worker-version handshake blocks any legacy Drip worker that cached all GETs until the user accepts the update. Updates wait for an explicit Reload update action; finish editing first. Bump the shell cache version when changing offline shell behaviour. Physical iPhone/Safari install behaviour must be tested separately; Chromium emulation is not that test.

## Backend verification

`DRIP_CLOUD_E2E=1 npm run e2e` additionally tests against the configured isolated Preview database: cross-device restore, offline queued writes, conflicts and unauthorised vault access. It creates synthetic encrypted test accounts. Ordinary CI skips this database-dependent case when credentials are absent but runs all offline and local journeys. Use dedicated non-production test data.

Server auth and vault endpoints require a session, same-origin writes, bounded encrypted payloads, per-owner vault rate limits and version checks. Never put database URLs, auth secrets, recovery codes, cookies or browser traces containing them into git or public CI artifacts.
