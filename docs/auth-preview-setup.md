# Preview sign-in readiness

PR42's initial Preview built successfully without any authentication settings.
The app's `/api/auth/*` route then returned503 because `cloudConfigured()` requires
all three settings below. A working UI and a READY deployment do not prove that
sign-in is available.

On26October the current Vercel environment metadata showed these settings scoped
to older Preview branches, with separate Production settings. The
`fix/post-deployment-signin` branch inherited none of them. Its stable auth URL
has now been installed, but its database and secret still need configuration.

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

## Prevention

The Vercel build now runs `npm run validate:deployment` before compilation. This
reuses the configuration guard already prepared in PR35: require all three keys,
validate their formats and check the stable auth origin matches the target.
It logs setting names/errors only and performs no database query or migration.
Local UI builds remain possible through `npm run build` without cloud credentials.

Sixteen preflight regressions cover missing/malformed/mismatched settings, safe
error output and the Vercel build wiring. The wiring test failed before this fix
and passed after it. The full local suite now passes430 tests; typecheck, optimized
build and audit pass. The earlier414-test/32-browser CI result applies to the
previous head; the new current-head checks must complete before readiness.

This confirms a Preview configuration defect. It does not establish the cause of
the separately reported Production failure: Production's invalid-credential probes
returned401 at19:48UTC, while no correlated user failure was captured in logs.
