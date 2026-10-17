# Drip

A local-first savings tracker and installable PWA. Nexus colours and self-hosted DM Sans. No real name, email address or phone number is requested.

## Run and test

Node 24. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm start`.
`npm run e2e` exercises mobile Chromium, including an offline reload. This is now a full-stack Next.js app, not a static `out/` export.

## Optional encrypted cloud recovery

Copy `.env.example` to ignored `.env.local`, supply a dedicated environment's database and random auth secret, and set `BETTER_AUTH_URL` to that environment's stable origin. Do not use deployment-specific URLs: storage and passkeys belong to a hostname. Never share Preview database credentials or auth secrets with Production. Run `node --env-file=.env.local scripts/migrate.mjs` against the selected database before starting.

From Recovery, enter the saved recovery code and enable encrypted cloud recovery. Add a cloud sign-in passkey. Existing local tracking works without enabling cloud. On a fresh browser/device choose Restore cloud accounts. A passkey authenticates but the recovery code is still needed to decrypt the cloud copy; code-only recovery is also supported. A gamertag is a display label, not an authentication credential or globally unique username.

Cloud authentication uses Better Auth and its passkey plugin. A domain-separated digest of the random recovery code supplies an internal synthetic `.invalid` email identifier and another digest supplies an authentication secret. No mail is sent. The root code is never sent to the server. Server-side authentication still handles security metadata such as rate limiting; this is pseudonymous, not a promise of anonymous financial data.

Cloud payloads use AES-256-GCM with random IVs and PBKDF2-SHA256 (600,000 iterations); the client derives a separate, non-exportable key and stores it in IndexedDB on a trusted device. Local account records themselves remain unencrypted; this change does not claim to encrypt the device database. Backups are encrypted. Losing the code and all trusted devices means losing access to the encrypted copy; there is no administrator decryption/reset.

Local changes and their queued-upload marker commit together. Sync runs on changes, reconnect, returning to the foreground, and periodically while the app is open. It is not a continuously running background service. Failed uploads keep local data. Local writes carry monotonically increasing revisions, and upload acknowledgements atomically preserve any newer revisions. Connection generations prevent a delayed upload from changing a restored/reconnected device. Every private request is bound to an expected account as well as a server session. Every upload uses compare-and-swap versions; a stale device gets a visible conflict and cannot overwrite the cloud copy. This version does not automatically merge accounts or events. Export a local backup before explicitly restoring a newer cloud copy. Expired sessions can be renewed using the code without replacing local accounts. File imports disconnect cloud recovery to prevent accidental cross-account uploads. Device app-lock credentials are excluded from cloud restores.

## PWA lifecycle

Manifest, icons, standalone mode and a service worker support installation. Open the stable URL in Safari → Share → Add to Home Screen, or use the install action in a supporting Android browser. Browser storage can still be cleared; installation is not a backup.

The service worker caches only the public shell, fonts and static assets. Auth/session/vault APIs are never cached. Before authentication or private requests, a worker-version handshake blocks any legacy Drip worker that cached all GETs until the user accepts the update. Updates wait for an explicit Reload update action; finish editing first. Bump the shell cache version when changing offline shell behaviour. Physical iPhone/Safari install behaviour must be tested separately; Chromium emulation is not that test.

## Backend verification

`DRIP_CLOUD_E2E=1 npm run e2e` additionally tests against the configured isolated Preview database: cross-device restore, offline queued writes, conflicts and unauthorised vault access. It creates synthetic encrypted test accounts. Ordinary CI skips this database-dependent case when credentials are absent but runs all offline and local journeys. Use dedicated non-production test data.

Server auth and vault endpoints require a session, same-origin writes, bounded encrypted payloads, per-owner vault rate limits and version checks. Never put database URLs, auth secrets, recovery codes, cookies or browser traces containing them into git or public CI artifacts.

## Recovery codes and Trends

Recovery → enable cloud recovery and sync first → enter the original saved code → Create six recovery codes → Download recovery codes. This creates a numbered text file containing six independent, reusable codes. Each random `DRIP2-` code encrypts the same original root using PBKDF2-SHA256 (600,000 iterations) and AES-GCM. Only SHA-256 locators and encrypted wrappers reach the server. Lookup returns no account data; authentication and vault decryption still happen using the recovered root in the browser. Original codes remain supported. Do not save this file alongside shared exports.

Replacing a set atomically removes its server lookups; this is not key revocation. Previously recovered devices or anyone who retained a decrypted root/wrapper keep access. Codes do not recover unsynced changes. New-device recovery requires network access; encrypted wrappers cached on a trusted device also support offline unlock. Downloads are shown only during that screen visit; save before leaving. Server save success still reveals the codes if local wrapper caching fails. Public recovery lookup and authenticated rotation have durable global/IP rate limits. IP buckets are HMAC-derived; forwarded IPs are trusted only on Vercel.

The old storage/fortnightly backup nags are replaced with local-only, queued or cloud-saved status. File backups, imports and app lock remain under Advanced. The onboarding original code also has a download action.

Trends plots recorded month-end snapshots, a Today marker, and dashed future estimates. No history is invented. The 3m/6m/1y/Max/Future controls filter the chart. Projection assumptions (monthly top-up and 1/3/5-year horizon) are saved with account data and included in encrypted recovery. Existing balances compound at their current annual rate divided by twelve; planned month-end top-ups use the current weighted rate. The baseline shows today's balance plus planned top-ups, not historical cost basis. Labels explain tax/fee/return limits; an accessible table provides the chart values.

## Sign out

Use **Sign out** beside your gamertag. It locks Drip on this device, pauses cloud sync and ends the cloud session when connected. Local accounts, encryption keys and queued revisions are retained; this is a screen gate, not encryption or removal of the local database. Enter an original or previously cached recovery code to reopen local data offline. Online return renews the matching cloud session without restoring over pending changes. Newly used alternative codes require online lookup.

Offline/failed cloud revocation stays visibly pending, retries on reconnect, and offers Retry cloud sign-out. Reload and other tabs keep the gate. Private requests and sign-out use the browser's shared Web Lock where available (per-tab queue fallback); generation checks reject stale sign-in/sign-out and restore completion. File/cloud restores commit data, verifier and connection atomically only while the initiating device session remains active. Sign-out does not delete the cloud account or cloud copy.

From the signed-out screen, **Use another account** restores an existing cloud account using its recovery code, after confirmation that this replaces the local accounts. A failed restore keeps the previous copy intact. The new account's data, verifier, encryption key and active device generation commit together. Cancelling the prompt leaves the device signed out.
