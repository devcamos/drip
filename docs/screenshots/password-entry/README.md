# Easier password entry

Login, signup and password setup now offer Show/Hide controls. They preserve the
exact password, spaces, case, autocomplete attributes and existing encryption;
toggling never submits a form. Signup explains a mismatched confirmation instead
of leaving the disabled button unexplained. Visibility resets when the screen
unmounts; passwords remain masked initially and are not stored by this control.

| State | Mobile390×900 | Desktop1280×900 |
| --- | --- | --- |
| Sign in | [Mobile](signin-mobile.png) | [Desktop](signin-desktop.png) |
| Signup with a mismatched confirmation | [Mobile](signup-mismatch-mobile.png) | [Desktop](signup-mismatch-desktop.png) |

Captured from the running optimized local implementation and visually inspected
on24 October2026. Synthetic identifier only. Screenshot-only CSS hides the input
characters, including a revealed confirmation, while leaving the controls visible.
No password/recovery code/customer data is displayed. No horizontal overflow at
either viewport. Browser tests exercise actual reveal/mask, exact-value retention,
independent confirmation visibility and mismatch correction.

## Password-policy scope

The existing creation/reset minimum remains12 and maximum256; there are no
capital/number/symbol composition rules. Sign-in does not enforce the creation
minimum on an existing password. No server hashing, proof, wrapper or KDF setting
is changed. The server's32-character recovery-credential minimum applies to an
opaque high-entropy recovery credential, not the human password.

The user's requested lower minimum is awaiting clarification. [Current OWASP
guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
recommends15 characters without MFA and8 with MFA. Drip does not require MFA;
lowering to8 would be an explicit convenience choice, not compliance with the
current password-only recommendation. This UI improvement does not claim full
OWASP/NIST compliance or resolution of the user's credential mismatch.

Hosted Preview is protected by Vercel Authentication. Local tests/screenshots
do not prove hosted behavior. The published Preview source and required
current-head checks are tracked in PR35. No Production change or release.
