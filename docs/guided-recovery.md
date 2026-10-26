# Account recovery

Forgot password now shows a configured encrypted unlock passkey on the saved
browser, recovery-code entry/file import, and help locating saved credentials.
An older cloud sign-in passkey is tucked into an advanced disclosure because it
cannot decrypt data on a fresh browser without a code.

## Available paths

- Settings → Passkey unlock accepts the current password or a recovery code.
  Setup still performs a second WebAuthn assertion to verify that the password
  manager actually supports PRF encryption before storing the encrypted wrapper.
- After unlocking, Settings → Sign-in & password can confirm the current
  password, a freshly verified encrypted unlock passkey, or a recovery code.
  The existing recovery-verified server endpoint saves the new password and
  revokes other server sessions. The vault root and financial data are retained.
- New signup prepares one original set of six recovery codes. A required
  download-and-confirm step opens before Accounts. Its checkpoint survives
  refresh/sign-in; existing accounts keep their currently registered set.
- Settings opens the same original file on the issuing browser after password,
  verified unlock-passkey or recovery-code confirmation. Codes are masked by
  default, reveal for up to 30 seconds, and hide on blur/download/confirmation.
  The API atomically refuses any different set, including older clients and
  competing tabs/devices. A retry of the same set preserves stored wrappers.
- Code-file import runs entirely in the browser, accepts up to six distinct
  supported codes, caps input at 32 KB, masks codes in the selector, and never
  submits the original text file. A later manual edit cancels a pending read.
- Accounts offers a recovery setup task until this browser has a configured
  encrypted unlock passkey or an explicitly confirmed saved-code download.
  A download click alone does not count as confirmation. The receipt contains
  only a vault identifier and timestamp, and cannot complete another vault's task.
  No routine code replacement exists. The first file is retained encrypted
  before registration so a lost response can retry the same set. Original-file
  retention and signup completion use guarded local transactions. Registration
  failure does not invalidate an existing saved-file confirmation.
- Signed-out screens reset private form state as part of route navigation. They
  do not run a delayed reset after the new form becomes interactive, which could
  erase a password-manager autofill. Leaving and returning still clears secrets.

## Security boundaries and limits

Fresh passkey confirmation rechecks the local vault, session generation, full
encrypted wrapper, code verifier and unlocked state after the credential prompt.
Cancelled prompts, a wrong PRF secret and account/session changes do not authorize
a credential update. Neither the root nor PRF result is persisted or logged.

Encrypted unlock passkeys rely on the wrapper stored in this browser. A synced
passkey by itself cannot restore that wrapper after browser storage is cleared
or on a fresh device. Password sign-in or a recovery code is still needed there.
Physical iPhone/Apple Passwords compatibility is not established by Chromium tests.

There is no email reset or service-held recovery key. Adding that path requires
a separate recovery-key security design and verified contact setup. These changes
cannot reconstruct an already-lost encryption key. Existing recovery-code reuse,
old-device access and root-revocation limitations are unchanged.

Verification and screenshots: [guided recovery evidence](screenshots/guided-recovery/README.md).

Signup failures now distinguish account creation from recovery. Only Better
Auth's explicit invalid-credentials HTTP 401 permits the optional registration
fallback; service failures, denied requests and rate limits stop the operation.
HTTP 429 is handled at both stages, and server/transport internals are not shown
to the user. [Signup failure tests and screenshots](screenshots/signup-errors/README.md)
document the separate, still-unidentified hosted signup report.

## Original-file limits

The server stores only hashed locators and encrypted root wrappers, not the raw
six codes. The issuing browser retains an additional root-encrypted original
file for retry/download. A fresh device without that encrypted file cannot
re-download the six codes; use the downloaded original. Routine settings cannot
replace a lost file. Existing previously rotated sets cannot be reconstructed;
the currently registered set becomes permanent. No compromise-revocation or
vault rekeying feature is added. Recovery provisioning has a shared eight-second
request deadline, shortened to three seconds during signup; failure opens the
retryable recovery step for the already-created account, not a signup error.

Verification: [original recovery evidence](screenshots/original-recovery/README.md).
