# Preview sign-in readiness

PR42's initial Preview built successfully without any authentication settings.
The app's `/api/auth/*` route then returned503 because `cloudConfigured()` requires
all three settings below. A working UI and a READY deployment do not prove that
sign-in is available.

On26October the current Vercel environment metadata showed these settings scoped
to older Preview branches, with separate Production settings. The
`fix/post-deployment-signin` branch inherited none of them. All three settings
were subsequently installed for this branch's Preview using the user's explicit
CLI grant, and a rebuild of the exact Git source passed the configuration guard.

Configure the following only for Preview, branch `fix/post-deployment-signin`,
team `devonte-amos-projects`, project `drip`:

- `DATABASE_URL`: the existing isolated Preview database, never Production.
- `BETTER_AUTH_SECRET`: a strong, stable secret for this branch.
- `BETTER_AUTH_URL`: `https://drip-git-fix-post-deployment-signin-devonte-amos-projects.vercel.app`.

Vercel does not return these saved Secret values through the current connection.
Keep values out of chat, code, logs and process arguments. Use the existing
configured local Preview environment through the authenticated CLI, or enter
the values directly in Vercel's environment settings. Do not broaden old branch
secrets to every Preview or change Production to repair this branch.

After configuration, rebuild the same Git source as a Preview. Changes to project
environment settings do not change an already-built deployment. Verify its exact
source/environment, authenticated access through Vercel protection, then
`/api/cloud/status` and the actual sign-in flow. A deliberate invalid-credential
probe should return401 rather than503; it does not prove valid-account sign-in.
Creating a synthetic cloud account remains subject to the outstanding explicit
approval request. Existing Production accounts are not copied into Preview.

For narrow protected checks, `vercel project token <project-id> --json` obtains
only a short-lived Development OIDC token. Keep it in memory and send it in the
`x-vercel-trusted-oidc-idp-token` header only to this project's Preview origin.
Avoid a full environment pull for a check needing only that token. Some CLI
versions automatically create a persistent project bypass for `vercel curl`;
do not use that path without explicit authorization for the access change.

## Prevention

The Vercel build now runs `npm run validate:deployment` before compilation. This
reuses the configuration guard already prepared in PR35: require all three keys,
validate their formats and check the stable auth origin matches the target.
It logs setting names/errors only and performs no database query or migration.
Local UI builds remain possible through `npm run build` without cloud credentials.

The preflight regressions cover missing/malformed/mismatched settings, safe error
output and the Vercel build wiring. The wiring test failed before the fix and
passed after it. Check required CI on the current PR head before marking ready;
the PR description records current verification rather than an earlier commit's
results. The one-time signup save flow and its local evidence are indexed in
[signup recovery screenshots](screenshots/signup-recovery-save/README.md).

This confirms a Preview configuration defect. It does not establish the cause of
the separately reported Production failure: Production's invalid-credential probes
returned401 at19:48UTC, while no correlated user failure was captured in logs.
