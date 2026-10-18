# Drip

A local-first savings tracker and installable PWA. Nexus colours and self-hosted DM Sans. No real name, email address or phone number is requested.

## Run and test

Node 24. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm start`.
`npm run e2e` exercises mobile Chromium, including an offline reload. This is now a full-stack Next.js app, not a static `out/` export.

## Optional encrypted cloud recovery

Copy `.env.example` to ignored `.env.local`, supply a dedicated environment's database and random auth secret, and set `BETTER_AUTH_URL` to that environment's stable origin. Do not use deployment-specific URLs: storage and passkeys belong to a hostname. Never share Preview database credentials or auth secrets with Production. Run `node --env-file=.env.local scripts/migrate.mjs` against the selected database before starting.

From Recovery, enter the saved recovery code and enable encrypted cloud recovery. Add a cloud sign-in passkey. Existing local tracking works without enabling cloud. On a fresh browser/device choose Restore cloud accounts. A passkey authenticates but the recovery code is still needed to decrypt the cloud copy; code-only recovery is also supported. A gamertag is a display label, not an authentication credential or globally unique username.

Cloud authentication uses Better Auth and its passkey plugin. A domain-separated digest of the random recovery code supplies an internal synthetic `.invalid` email identifier and another digest supplies an authentication secret. No mail is sent. The root code is never sent to the server. Server-side authentication still handles security metadata such as rate limiting; this is pseudonymous, not a promise of anonymous financial data.

Cloud payloads use AES-256-GCM with random IVs and PBKDF2-SHA256 (600,000 iterations). The separate non-exportable cloud key stays only in memory while this page is unlocked. Backups are encrypted. There is no administrator decryption/reset; keep recovery codes outside this device.

Local changes and their queued-upload marker commit together. Sync runs on changes, reconnect, returning to the foreground, and periodically while the app is open. It is not a continuously running background service. Failed uploads keep local data. Local writes carry monotonically increasing revisions, and upload acknowledgements atomically preserve any newer revisions. After encryption and before upload, sync rechecks the account, connection generation and base version: a restore or reconnect completed during encryption cancels the stale upload. Connection generations also prevent a delayed acknowledgement from changing a restored/reconnected device. Every private request is bound to an expected account as well as a server session. Every upload uses compare-and-swap versions; a stale device gets a visible conflict and cannot overwrite the cloud copy. This version does not automatically merge accounts or events. Export a local backup before explicitly restoring a newer cloud copy. Expired sessions can be renewed using the code without replacing local accounts. File imports disconnect cloud recovery to prevent accidental cross-account uploads. Explicit disconnect clears connection metadata only after confirmed server sign-out, with device/connection generation checks; a failed disconnect retains the connection and queued edits. Device app-lock credentials are excluded from cloud restores.

## Encrypted local accounts

Local unlock is independent of cloud authentication. After sign-out, a valid recovery code opens the existing encrypted device copy before a best-effort cloud sign-in runs. Authentication outages keep local accounts, edits and queued uploads usable. The renewal is bound to the device generation and cannot start after a later sign-out/account switch. If it fails, sync reports that sign-in is needed; Recovery → Device sign-in options → Sign in without replacing local data renews the session later. Only the original code or an already cached alternative can unlock offline without a server lookup.

Account records, balances, history, gamertag and device app-lock settings are stored in IndexedDB as AES-256-GCM ciphertext. Each vault has a random 256-bit data key; a random-salt PBKDF2-SHA256/AES-GCM wrapper protects it under the original recovery root. Data encryption uses a fresh 96-bit nonce per write and authenticates the vault id. Non-exportable local and cloud keys exist only in page memory. IndexedDB retains the wrapped data key, salted recovery verifier, encrypted recovery wrappers and non-secret connection/session metadata (random ids, versions, revisions, timestamps and flags), not usable CryptoKeys or the root code.

A full reload, new tab or process restart needs an original or cached alternative recovery code. Each tab unlocks independently; foregrounding a still-unlocked page preserves its session. Sync runs only while unlocked. Ordinary Face ID/passkey screen checks do not unwrap the data key; passkey PRF encryption is not implemented. The optional extra screen lock is distinct from encryption and keeps the active page's key in memory.

Existing installs show **Encrypt this device** before revealing accounts. A matching code verifies the existing recovery verifier and legacy cloud key. Encryption is decrypted and checked before one guarded transaction replaces plaintext, removes the old stored cloud key/onboarding key and installs the wrapped-key header. Failure, a competing restore or sign-out leaves the old copy intact. Schema v2 prevents legacy v1 clients from writing plaintext over the vault. Do not downgrade to an old client after migration. Migration removes accessible old records; secure physical erasure from browser/OS backups is not guaranteed.

New onboarding drafts stay in memory only. Leaving before **Start** generates a new code and clears the unsaved gamertag; download/save the code used for the completed account. File/cloud imports create a new local vault under that account's root and invalidate pending writes from the replaced copy. Before committing a replacement, one IndexedDB transaction verifies that the stored data and cloud metadata still match the pre-encryption snapshot. An edit from this or another tab, or a completed sync during encryption, cancels replacement and preserves the current copy. Data encryption does not protect an already unlocked page from malicious same-origin scripts or a compromised device. Losing all codes after the page closes also loses access to unsynced local data.

## PWA lifecycle

Manifest, icons, standalone mode and a service worker support installation. Open the stable URL in Safari → Share → Add to Home Screen, or use the install action in a supporting Android browser. Browser storage can still be cleared; installation is not a backup.

The service worker caches only the public shell, fonts and static assets. Auth/session/vault APIs are never cached. Update/version messages are accepted only from the app's own origin. Before authentication or private requests, a worker-version handshake blocks any legacy Drip worker that cached all GETs until the user accepts the update. Updates wait for an explicit Reload update action; finish editing first. Bump the shell cache version when changing offline shell behaviour. Physical iPhone/Safari install behaviour must be tested separately; Chromium emulation is not that test.

## Backend verification

`DRIP_CLOUD_E2E=1 npm run e2e` additionally tests against the configured isolated Preview database: cross-device restore, offline queued writes, conflicts and unauthorised vault access. It creates synthetic encrypted test accounts. Ordinary CI skips this database-dependent case when credentials are absent but runs all offline and local journeys. Use dedicated non-production test data.

Server auth and vault endpoints require a session, same-origin writes, bounded encrypted payloads, per-owner vault rate limits and version checks. Never put database URLs, auth secrets, recovery codes, cookies or browser traces containing them into git or public CI artifacts.

## Device-only nicknames

Cloud payloads use an explicit allowlist, including nested account/history fields. Account nicknames and device lock settings are excluded before encryption. New local fields are not synced by default. Cloud restores strip those fields from older copies; restoring the same account while this device is unlocked preserves its current local nicknames by account id. A new device starts with blank nicknames.

The next successful sync replaces an older current cloud copy containing excluded fields even when no financial edits are queued. This does not claim to erase historical infrastructure backups. Manual encrypted file exports remain full copies of the local records, including nicknames; that is an explicit export rather than automatic cloud sync.

## Recovery codes and Trends

Recovery → enable cloud recovery and sync first → enter the original saved code → Create six recovery codes → Download recovery codes. This creates a numbered text file containing six independent, reusable codes. Each random `DRIP2-` code encrypts the same original root using PBKDF2-SHA256 (600,000 iterations) and AES-GCM. Only SHA-256 locators and encrypted wrappers reach the server. Lookup returns no account data; authentication and vault decryption still happen using the recovered root in the browser. Original codes remain supported. Do not save this file alongside shared exports.

Replacing a set atomically removes its server lookups; this is not key revocation. Previously recovered devices or anyone who retained a decrypted root/wrapper keep access. Codes do not recover unsynced changes. New-device recovery requires network access; encrypted wrappers cached on a trusted device also support offline unlock. Downloads are shown only during that screen visit; save before leaving. Server save success still reveals the codes if local wrapper caching fails. Public recovery lookup and authenticated rotation have durable global/IP rate limits. IP buckets are HMAC-derived; forwarded IPs are trusted only on Vercel.

The old storage/fortnightly backup nags are replaced with local-only, queued or cloud-saved status. File backups, imports and app lock remain under Advanced. The onboarding original code also has a download action.

Trends plots recorded month-end snapshots, a Today marker, and dashed future estimates. No history is invented. The 3m/6m/1y/Max/Future controls filter the chart. Projection assumptions (monthly top-up and 1/3/5-year horizon) are saved with account data and included in encrypted recovery. The baseline shows today's balance plus planned top-ups, not historical cost basis. An accessible table provides the chart values.

## Products, income and predictions

Choose Cash ISA, easy-access saver, regular saver, current account, stocks/funds or Other. Categories set editable calculation defaults for every provider, without enforcing eligibility, deposit limits or withdrawal conditions. Stocks/funds can be marked as held in a Stocks & Shares ISA. Providers never determine ISA status automatically; older accounts remain unclassified until edited.

The entered balance is authoritative. Opening Drip, logging interest/dividends/bonus payments and calculating predictions never credit interest to that balance. Use Update balance to match the provider, or Top up/Withdraw for transfers. Forms wait for the encrypted write before finishing; wait for "Saved on this device" before reloading or closing. Failed writes keep entries available and display a backup/retry message. Balance corrections aren't inferred to be income. Actual income is recorded separately by receipt date, with monthly/all-time totals and weekly/monthly grouping; log individual payments or one monthly total, without duplicating both. Mistaken receipts can be removed. Old actual payouts are retained. Previous auto-generated daily estimates remain under Previous interest estimates, separate from actual income; existing balances aren't retroactively changed.

Enter the standard annual interest rate or expected dividend yield. Monthly/daily figures are approximate averages, not exact provider settlements or an AER-to-gross conversion. Forecasts average income monthly at the current rate, with reinvestment configurable per account (on for cash products, off for stocks/funds by default). Stock price changes aren't predicted. Planned deposits arrive at month end and are split in proportion to starting account balances. Predicted income excludes deposits and includes income paid out, even when that income isn't reinvested into the projected balance.

An optional pending bonus stores only an amount and expected payment date. Update this from the provider; Drip doesn't calculate further bonus accrual or eligibility. Future-dated bonuses enter the prediction once, never the saved balance or recorded income. Past-dated pending bonuses stay visible but are excluded from forecasts until their date is updated. Recording a bonus receipt clears its pending prediction; update the account balance separately if needed. Categories, ISA status, income receipts, reinvestment assumptions and pending bonuses are included in encrypted backups and cloud recovery. Device-only nicknames remain excluded from cloud payloads.

## Sign out

Use **Sign out** beside your gamertag. It locks Drip on this device, pauses cloud sync and ends the cloud session when connected. Already-accepted local saves finish before locking. Encrypted accounts and queued revisions are retained; usable local/cloud keys and the decrypted account view are dropped from this page. Enter an original or previously cached recovery code to reopen local data offline. Online return renews the matching cloud session without restoring over pending changes. Newly used alternative codes require online lookup.

Offline/failed cloud revocation stays visibly pending, retries on reconnect, and offers Retry cloud sign-out. Reload and other tabs keep the gate. Unlocking one tab does not give keys to another; each needs its code. Private requests and sign-out use the browser's shared Web Lock where available (per-tab queue fallback); generation checks reject stale sign-in/sign-out and restore completion. File/cloud restores commit data, verifier and connection atomically only while the initiating device session remains active. Sign-out does not delete the cloud account or cloud copy.

From the signed-out screen, **Use another account** restores an existing cloud account using its recovery code, after confirmation that this replaces the local accounts. A failed restore keeps the previous copy intact. The new account's ciphertext, verifier, wrapped data key and active device generation commit together; usable keys are activated only in memory after the commit. Cancelling the prompt leaves the device signed out.
