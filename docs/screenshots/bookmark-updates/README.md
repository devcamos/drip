# Saved-bookmark update evidence

20 October 2026. Synthetic local Chromium / Pixel 7 emulation; mobile viewport
390 × 900 and desktop 1280 × 900, full-page screenshots. Both images were opened
and visually inspected; no horizontal overflow was detected. No password,
recovery code, token or customer data is visible.

| State | Mobile | Desktop |
| --- | --- | --- |
| Existing saved account, with a new app update waiting for explicit reload | [View](update-ready-mobile.png) | [View](update-ready-desktop.png) |

The banner was captured in the **previous running application (45a01d2)** while
the new service worker waited for approval. Its wording/layout is unchanged by
this implementation. The update installed from the current working-tree build,
from tested source **954d88018bb2fa1c36c4debe87e1a6dcf013c654**,
whose public build ID was `local-ca64d99e-4a29-4b8d-9789-ab9bdbf9521e`. This is
transition evidence, not a claim that the old application had the new foreground
update checks. No Production deployment was changed for this test.

## What was verified

The opt-in `e2e/pwa-update.spec.ts` journey **passed** (2.3 minutes including the
coordinated build wait):

1. Start on the actual previous optimized application and preserved v15 worker.
   Seed an encrypted synthetic Zopa account with £3,000 and open a second tab.
2. Keep the bookmark origin stable through a local proxy while the upstream
   application is rebuilt/restarted. The first update check is explicit because
   the previous application did not have the new foreground-check hook.
3. Verify the update-ready banner without automatic reload, then accept it.
   Reopen the encrypted account and verify £3,000 remains. The other tab is not
   reloaded; its old immutable chunk remains readable offline.
4. Reload the updated application offline and reopen the same saved account.
5. Simulate a subsequent public build-identity response using a clearly labelled
   `-next-fixture` value. The main worker bytes stay identical. The actual updated
   UI's focus check detects that imported-script change; explicit acceptance
   refreshes the offline shell again and preserves the £3,000 account.
6. Verify a second offline reload and ensure no `/api/` responses entered caches.

The simulated imported identity tests the browser's imported-script update
mechanism; it is not a second real deployment. Focused component/worker tests
also passed **9/9**, covering foreground/reconnect/periodic checks, failed and
duplicate checks, an update already activated by another tab, per-build caches,
old-tab chunk availability, failed installation preservation and same-origin
worker messages. Typecheck passed.

Root also verified compiled `/sw-build.js` executes as valid JavaScript, matches
`.next/BUILD_ID`, and returns `no-store` for browser, CDN and Vercel CDN caching.
Guardian independently passed 19 focused checks and closed the initial
same-commit rebuild-identity finding; no further confirmed blocker in that scope.
The full suite passed **288 unit/component tests**, with coverage 94.44% statements,
91.23% branches,94% functions,97.84% lines and unchanged thresholds. A later
same-commit build-identity regression is checked separately and in final CI.
Optimized build/typecheck passed. Standard browser run: **18 passed,13 skipped**;
the skipped cases require an isolated cloud backend or coordinated deployment,
including the separate passing upgrade journey above.

## Reproducing the coordinated transition

This optional test is skipped in ordinary CI. It needs the previous optimized
build running on localhost4321, the new source checked out, and Git history
containing 45a01d2. Before starting, remove stale `/tmp/drip-pwa-old-seeded` and
`/tmp/drip-pwa-new-ready` markers. Run:

```sh
PW_CHROME=/usr/bin/chromium DRIP_PWA_UPGRADE=1 \
  npm exec -- playwright test e2e/pwa-update.spec.ts --workers=1
```

After `/tmp/drip-pwa-old-seeded` appears, build the current source and restart the
upstream server on the same port. Once it is ready, write the **content** `ready`
to `/tmp/drip-pwa-new-ready`. The test keeps a stable localhost4322 bookmark origin
through its local proxy. It uses synthetic IndexedDB fixtures and does not write
cloud accounts or need Production credentials.

## Delivery limits

Customers should bookmark the **stable app domain**, not an immutable URL for an
old deployment. An online saved app checks for a new version when it returns to
the foreground/reconnects and periodically while open. Updates wait for the user
to finish editing and select Reload update. A saved account remains encrypted on
its existing origin; no site-data reset or reinstall is part of updating.

These checks do not establish physical Safari/iPhone home-screen or Android
installation behavior. Old public shell caches are retained while multiple app
windows remain open; a later activation with at most one open window cleans them.

Use https://drip-one-xi.vercel.app/ for released versions. This PR has not been
released to Production. Hosted Preview backend verification remains separately
blocked: automatic approval review rejected the credential transfer despite
the general Preview approval and requested an explicit payload/destination
authorization. No credentials were transferred; the new request is pending.
