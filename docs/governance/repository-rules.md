# Repository rules — drip

## Product application
Personal local-first financial tracker with optional encrypted cloud recovery. Preserve encryption, recovery/account boundaries, local records and queued edits through auth/sync/update failures. Never log decrypted financial data, credentials, root codes or keys. Do not promise anonymity or administrator decryption.

## Verification
Current commands (package.json is authoritative):

```text
npm ci
npm run typecheck
npm test
npm run build
npm run audit
npm run depcruise
npm run e2e
```

## Boundaries and evidence
Use .nvmrc and the lockfile. No lint script exists in current package.json: report accurately, not as a passed check. Use stable origins and separate Preview/Production credentials. Update/offline changes require old-to-new release, reconnect, failure and multiple-tab checks with preserved synthetic data. Do not clear site data/reinstall as a routine update mechanism. README migration commands are not permission to run them; Production/migrations require explicit approval.

Use feature PRs; no direct main push, auto-merge, gate bypass or unapproved merge/release. Shared timing/permissions apply with only explicit scoped exceptions. Preserve stricter existing controls. Documentation-only changes check links/paths/commands; they do not change runtime behavior, gates, credentials or migrations.
