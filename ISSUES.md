# Drip: GitHub issue drafts

Drafts only. Nothing here has been filed. Suggested labels are listed per issue.

---

## 1. Set up the Vercel preview (Hobby, preview only)
**Labels:** `infra`, `blocked`, `v1`

The Drip v1 static build (`npm run build` → `out/`) is ready, but there's no Vercel project yet. Creating one through the API returned `403 forbidden: You don't have permission to create a project` (team `devonte-amos-projects`).

**To do**
- [ ] Create a `drip` project on the **Hobby** plan, linked to the private `devcamos/drip` repo.
- [ ] Framework: Next.js (static export). Output directory: `out`.
- [ ] PR and branch pushes → preview deployments only. Don't attach a production domain until the maintainer says go.
- [ ] Leave Vercel Deployment Protection on. If it blocks the maintainer's iPhone, decide with the maintainer whether to use a share link or bypass.
- [ ] Confirm the PWA installs from the preview URL on iOS Safari.

**Done when:** a preview URL loads on the maintainer's iPhone and installs to the home screen, and nothing is live in production.

---

## 2. Trademark and app-store name check for "Drip"
**Labels:** `research`, `brand`, `pre-launch`

"Drip" was chosen on 15 Oct 2026. Before anything goes public:
- [ ] Search the UK IPO and EUIPO (and USPTO if the app goes to the US App Store) for "Drip" in classes 9 (software) and 36 (financial services).
- [ ] Check App Store and Play Store for apps with the same or a similar name in Finance.
- [ ] Check domain and handle availability.
- [ ] Shortlist fallback names if there's a conflict.

Not legal advice. A trademark attorney should confirm if Drip goes public.

---

## 3. Use official provider brand colours (or neutral ones)
**Labels:** `design`, `v1.x`

The card colours in `app/Drip.tsx` (`PROVIDERS`) are approximate, not taken from official brand assets.
- [ ] Check each provider's brand guidelines (Zopa, MoneyFarm, Chip, Plum, Trading 212, Vanguard, Marcus, Premium Bonds).
- [ ] Where we're not allowed to use their marks or colours, switch to a neutral palette and let the user pick a colour for each account.
- [ ] Don't use provider logos without permission.

---

## 4. Cross-device sync (v1.1)
**Labels:** `feature`, `v1.1`, `security`

Spec section 11: one end-to-end encrypted bundle per user on Supabase's free tier, keyed by a random ID, with a version number.
- [ ] Bundle = the same AES-GCM blob as the backup file (recovery code is the root key), so the server only ever sees ciphertext and a version number.
- [ ] Optimistic concurrency: reject writes whose base version ≠ server version, then resolve in the client (pull, merge events, push).
- [ ] Merge strategy: events (top-ups, withdrawals, rate changes, payouts) are append-only with IDs, so merge them as a union. Balances are worked out again from the merged events.
- [ ] Passkey sign-in turns on with sync. The gamertag (see #13) becomes the account name, and `identity.id` becomes the sync account id.
- [ ] Rate limits and abuse protection with no personal data stored.
- [ ] Threat model write-up.

---

## 5. Rate monitor agent (v2)
**Labels:** `feature`, `v2`, `compliance`

Spec section 6. It watches the public rate pages for providers the user holds and creates an in-app alert when a rate changes, e.g. "Zopa moved from 7% to 6.5%, about £1.25 a month less".
- [ ] Choose sources and check each site's terms for automated access.
- [ ] Rate changes should feed into `rateHistory` with an effective date and `source: "monitor"`, after the user confirms.
- [ ] Only factual comparisons. Never recommend a product, because that would be personalised financial advice.
- [ ] Watch privacy: the server mustn't learn which providers a user holds, unless that's accepted and stated clearly.

---

## 6. Tax (out of scope, parked)
**Labels:** `wontfix-v1`, `idea`

Possible later: an ISA flag on each account, and an estimate of usage against the Personal Savings Allowance. Keep it out of v1. If added, label it clearly as an estimate, not tax advice, and keep it optional.

---

## 7. Interest shown in the app is a simple estimate; use day-accurate accrual in the screens
**Labels:** `enhancement`, `maths`

`lib/maths.ts` has `accrue()`, which compounds daily and handles top-ups, withdrawals and rate history. The screens still show balance × rate ÷ 12 for "this month" and use the current balance for projections.
- [ ] Use `accrue()` for each account's expected interest for the current period and for the Trends interest figure.
- [ ] Decide per provider whether interest compounds daily, monthly or not at all. This could be a setting on each account.

---

## 8. Month history only starts when the app is used
**Labels:** `enhancement`, `trends`

Snapshots are written when data changes, so a month with no edits has no snapshot, and the first two months show no month-on-month figure.
- [ ] Build missing month-end snapshots from the event log and rate history.
- [ ] Let users enter past balances once when adding an account.

---

## 9. App lock is a screen gate only; consider encrypting data at rest
**Labels:** `security`, `enhancement`

The passkey lock stops casual access, and the settings text says so honestly. But IndexedDB data isn't encrypted on the device.
- [ ] Option: encrypt the local data with a key wrapped by the recovery code and/or the WebAuthn PRF extension when it's available (iOS 18+ Safari supports PRF in some cases). Check browser support before committing to it.
- [ ] Re-test the background re-lock (5 minutes) on iOS, where `visibilitychange` timing differs for installed home-screen apps.

---

## 10. Screen tests: cover the rate-change form and the background re-lock
**Labels:** `testing`

The Playwright smoke tests cover onboarding, add account, top-up, withdraw, Trends, backup export and import, and the passkey lock with recovery-code fallback. Still missing:
- [ ] Editing a rate with an effective date, plus the rate history list.
- [ ] Re-lock after 5 minutes hidden (use a fake clock).
- [ ] A WebKit (Safari) run, to catch iOS-specific problems.

---

## 11. Accessibility and polish pass
**Labels:** `a11y`, `design`

- [ ] Give form fields proper `<label for>` links (some inputs only have placeholders).
- [ ] The bar chart needs a text alternative or table for screen readers.
- [ ] Check colour contrast on the provider cards.
- [ ] Respect `prefers-reduced-motion` and test the fixed bottom tabs on small iPhones.

---

## 12. Repo and PR set-up
**Labels:** `infra`, `blocked`

- [ ] Create the private `devcamos/drip` repo and push `main`.
- [ ] Branch protection on `main` requiring CI (type check, unit tests with coverage limits, build, Playwright).
- [ ] Optional: Dependabot for npm and GitHub Actions.

---

## 13. Sync: reserve and check gamertag uniqueness on the server
**Labels:** `feature`, `v1.1`, `sync`, `identity`

In v1 the user types their own handle (3–16 characters: letters, numbers, `_`). It's stored on the device only as `identity = { id, handle, suffix?, createdAt }`, with **no suffix**, and nothing checks whether it's unique. Settings tells the user: "If this name is taken when sync launches, we'll add a short number to it."

**To do**
- [ ] Server endpoint to reserve a handle for an `identity.id`. It should be atomic and case-insensitive (`Devo` = `devo`), and store only the id, handle and suffix. No personal data.
- [ ] If the plain handle is free, keep it with no suffix. If it's taken, give a short random number (1–4 digits, `randomSuffix()` / `withSuffix()` already exist in `lib/identity.ts`) and keep retrying until it's free.
- [ ] Tell the user in the app what was added (e.g. "devo was taken, so you're devo#4821"), and let them pick a different handle instead.
- [ ] Prove ownership: later changes must be signed by the account's passkey, so nobody else can claim an `identity.id`.
- [ ] Optional block list for offensive or reserved handles, plus rate limits on reservations.
- [ ] Renames: release the old handle after a cooling-off period.
- [ ] Merge rule when a backup's identity is restored on a new device after sync exists (same id → same account).
