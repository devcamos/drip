# One-time signup recovery save

Application source: [`bddd7a8`](https://github.com/devcamos/drip/commit/bddd7a8ed9c4c0d8c5af8e97a41b3bbbf9ef90fc).
Captured and visually inspected on27October2026 from the optimized local app,
build `local-bf5bbd67-3e49-448f-b3d8-a41d865b4d45`. The following evidence commit
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

All eight images were opened and inspected. Layout checks found no horizontal
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
- Completed signup does not show this step again. Settings can open the same set
  using its existing confirmation. No replacement set is generated.
- The temporary signup key is memory-only and unavailable after lock, sign-out,
  completion or a different vault. Raw storage contains neither it nor a password.

Validation:436 unit/component tests pass; coverage94.18% statements,91.75% branches,
93.80% functions,97.91% lines. Typecheck, optimized build and audit pass;34 browser
journeys pass,16 existing cloud/update opt-ins skipped. The old UI failed the new
no-second-password regression. The retry journey initially needed its alert
locator scoped to the panel to exclude Next's route announcer; the corrected
journey and complete browser suite pass. No assertions or required gates weakened.
