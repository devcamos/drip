# One-time signup recovery save

Application source: [`ea5d83d`](https://github.com/devcamos/drip/commit/ea5d83d839bccabe6437bd470fb6d13156b21635).
Captured and visually inspected on27October2026 from the optimized local app,
build `local-1c7c38b0-de69-49b7-ad51-b8d7091a0645`. The following evidence commit
adds screenshots/documentation only.

The account/backend responses are synthetic. Encryption, local storage, password
unlock after reload, original-code generation, downloads and the rendered app are
real. These images are not evidence of a hosted database signup or physical iPhone
behavior. Recovery-code elements are masked in the captures; the app displays the
actual six codes. No password, code, token or customer information is published.

| State | Mobile390×844 | Desktop1280×900 |
| --- | --- | --- |
| Original codes open automatically; Continue requires saved-copy acknowledgement | [View](save-original-codes-mobile.png) | [View](save-original-codes-desktop.png) |
| Screenshot or download saved; Continue enabled | [View](saved-copy-confirmed-mobile.png) | [View](saved-copy-confirmed-desktop.png) |
| Accounts after completion | [View](accounts-after-save-mobile.png) | [View](accounts-after-save-desktop.png) |
| Recovery-service failure keeps the account and offers retry | [View](recovery-retry-mobile.png) | [View](recovery-retry-desktop.png) |

All eight images were opened and inspected; unchanged captures retain identical
image bytes. Layout checks found no horizontal
overflow; the six code rows, download, acknowledgement and Continue controls fit
within their panels. Codes hide when the app loses focus.

## Behavior verified

- Signup opens the original six codes without another password field or gamertag
  sign-in request. An explicit saved-copy checkbox accepts a screenshot or a file.
- A screenshot acknowledgement reaches Accounts without initiating a download.
  Downloading creates a readable six-code file and still requires acknowledgement.
- An unfinished signup survives reload and the ordinary sign-in needed to unlock
  the app. It resumes the same original set without a second password prompt.
- A failed initial recovery request can retry in the authenticated signup session.
  Storage-confirmation failures keep the checkpoint until confirmation succeeds.
- After sign-out revokes the cloud session, offline password sign-in can resume
  local setup. Reconnecting and retrying renews the existing account's session
  without another password or signup request, then opens the same six codes.
- Completed signup does not show this step again. Settings can open the same set
  using its existing confirmation. No replacement set is generated.
- The temporary signup key is memory-only and unavailable after lock, sign-out,
  completion or a different vault. Raw storage contains neither it nor a password.
- An initial signup with no device generation still binds its renewal before
  dispatch. Switching accounts while it waits blocks the request with the screen
  either open or unmounted. A delayed file response after blur or background/return
  keeps codes hidden until the user explicitly selects Show.

Validation:443 unit/component tests pass; coverage94.29% statements,92.03% branches,
93.93% functions,97.91% lines. The whole-app gate is85%, with the stricter library
thresholds retained. Typecheck, optimized build and audit pass;36 browser
journeys pass,16 existing cloud/update opt-ins skipped. The old UI failed the new
no-second-password regression. The expired-session regression also failed before
guarded renewal was restored. The retry journey initially needed its alert
locator scoped to the panel to exclude Next's route announcer; the corrected
journey and complete browser suite pass. No assertions or required gates weakened.

The dedicated old-main-to-candidate PWA test also passed separately: distinct
real build fingerprints, a waiting-worker reload, retained encrypted records,
wrong-password rejection and successful offline return with the same balance.
This uses local unconfigured builds and synthetic data, not hosted cloud identity
or customer records. It closes one of the ordinary suite's16 skipped opt-ins.
