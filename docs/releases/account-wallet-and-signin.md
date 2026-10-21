# Drip — account wallet and sign-in update

Release candidate in [PR23](https://github.com/devcamos/drip/pull/23).
Live app: https://drip-one-xi.vercel.app/

## Release notes for users

- Browse accounts in a scrollable card stack, with your total balance above it.
- Personalise account colours, including a custom colour and preview.
- Choose Lloyds Bank, or select Trading 212 stocks/funds from the suggested names
  and add your own. Enter your balance, dividend yield and payment schedule.
- Sign in with your gamertag and password on up to two browsers/devices. Reopening
  the same browser keeps its slot; a third sign-in asks you to sign out on one.
- If a different account is saved in this browser, login offers an explicit switch
  after checking the password. Cancelling keeps the saved account. Unsynced or
  device-only accounts must be saved to cloud before this switch can proceed.
- Failed saves retain your entries for retry, and cloud-save messages reflect the
  actual state of your data.
- Bookmarked/home-screen copies detect new versions and offer Reload update.
  Finish editing before accepting it; saved encrypted accounts are preserved.
- Installation guidance is now a setup task. Completing it shows a brief
  confirmation, then removes it; completion and dismissal are remembered on that
  browser. iOS offers “I've added Drip” for manual confirmation.

Your entered balance remains authoritative. Predictions and recorded income do
not change it automatically. A browser profile counts as one device; separate
browsers/private profiles count separately. The limit controls active cloud
sessions; it cannot remove exported backups or decryption keys already held offline.

## Release preparation

- Run current-head typecheck, coverage gates, optimized build, dependency audit
  and browser checks; verify two-browser/third-rejection and safe switching
  against the isolated test database.
- Review the inspected [wallet screenshots](../screenshots/account-wallet/README.md)
  and [sign-in screenshots](../screenshots/two-device-signin/README.md) before handoff.
- Apply the additive `session.dripDeviceId` migration to the intended environment
  **before** serving the new authentication code. No vault records or financial
  data need to be copied from Preview to Production.
- Existing legacy sessions have no browser identifier and are counted
  conservatively. The prepared [release-only session cleanup](../../scripts/release-device-session-cap.sql)
  keeps the two newest active sign-ins per account, signing out older ones once.
  Review/authorize that step and ensure retired deployments cannot issue
  Production sessions before executing it. The ordinary schema migration does
  not silently revoke existing sessions.
- Hosted signup/login/recovery and safe switching passed against the configured
  isolated Preview; see the [verification record](pr23-verification.md).
- After readiness and explicit Production release authorization, migrate the
  Production schema, merge the verified source and deploy; verify the live
  build, sign-in and data retention without accessing customer financial data.
- Watch authentication errors, third-device rejections and sync failures after
  release. Do not clear site data or ask users to reinstall as an update step.

## Rollback

Keep the new nullable session column: the previous code can ignore it. Roll back
application source/deployment if required, preserving encrypted records. Rolling
back the session-limit code removes its enforcement. A rollback to a build before
the holding-name feature can omit that field when resaving; review that
compatibility limit before choosing a rollback version.

This document prepares the release; it does not publish the application, send a
customer announcement or authorize a Production database change.
