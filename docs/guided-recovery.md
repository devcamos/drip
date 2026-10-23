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
- Recovery codes can be created using a freshly verified unlock passkey, even
  if the old password and code are unavailable. Existing confirmation and
  registration safeguards remain in place. Generated codes are masked by default;
  explicit reveal is available, and download, saved-file confirmation, window blur
  and hiding the tab conceal them again.
- Code-file import runs entirely in the browser, accepts up to six distinct
  supported codes, caps input at 32 KB, masks codes in the selector, and never
  submits the original text file. A later manual edit cancels a pending read.
- Accounts offers a recovery setup task until this browser has a configured
  encrypted unlock passkey or an explicitly confirmed saved-code download.
  A download click alone does not count as confirmation. The receipt contains
  only a vault identifier and timestamp, and cannot complete another vault's task.
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
