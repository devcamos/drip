# App updates and saved links

The Production Home Screen icon or bookmark must use Drip's stable Production origin. Preview URLs are separate environments and are not a permanent Production link. A release updates the server at that origin; it does not require a new bookmark. It does not guarantee that a closed or offline device immediately receives the new version.

## How updates work

`next.config.mjs` creates a public build fingerprint. `/sw-build.js` exposes it to the service worker, and both worker scripts have no-store headers. `public/sw.js` caches public shell assets only; authenticated APIs and account data are not cached there. `PwaStatus` requests an update on registration, foreground, reconnect and every five minutes while visible. The browser controls update discovery and service-worker installation.

When an update is waiting during an active session, Drip offers a reload. It disables the action while an edit, save or preference change is in progress, or when the user is outside Accounts and Portfolio. A waiting worker can also activate under the browser's normal lifecycle after old controlled clients close; the timing is browser-dependent. A manual check in Settings requests an update but does not claim that one was installed or reload the page. Avoid forced reloads that might discard work. Failed or offline checks leave the existing version and data in place.

## Verification and release

Run the PWA unit and browser checks through the [regression policy](testing/regression-policy.md). The current-build browser test covers a synthetic fingerprint change, a second tab and offline encrypted data; it does not prove a transition from a previously released build. The added mobile WebKit update journey currently fails to show the reload prompt; diagnose it before considering that gate passed. WebKit emulation is not a physical iPhone Home Screen test. Verify real old-to-new builds and installed iPhone/Android behavior using synthetic data before treating those paths as covered.

Keep API and database changes compatible with an older client that may remain open or offline. Roll back using the normal deployment rollback and retain compatible assets and server contracts. Never clear a user's browser storage as an update step. For a stuck installation, first confirm the Production URL, connection and update status; preserve recovery access and avoid destructive troubleshooting.
