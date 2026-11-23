/** The browser regression fixture may use direct Postgres only when every
 * connection/origin setting explicitly identifies the same local test target.
 * Normal deployments keep the existing Neon transport.
 */
export function regressionDatabaseURL(value: string, allowBrowserSchema = false): URL {
  const denied = () => new Error("Regression requires the disposable loopback database without connection overrides; target withheld.");
  let url: URL;
  try { url = new URL(value); } catch { throw denied(); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/drip_notifications_test" || url.hash) throw denied();
  const params = [...url.searchParams];
  // pg accepts query-string host/port overrides. Checking only URL.hostname
  // would let a local-looking connection reach another database.
  if (params.length && !(allowBrowserSchema && params.length === 1 && params[0][0] === "options" && /^-c search_path=browser_[a-f0-9]{32}$/.test(params[0][1]))) throw denied();
  return url;
}

const localDatabaseSetup = [
  "docker run --rm -d --name drip-regression-db \\",
  "  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=drip_test \\",
  "  -e POSTGRES_DB=drip_notifications_test \\",
  "  -p 127.0.0.1:55438:5432 postgres:18-alpine",
].join("\n");

/**
 * Fail before running the expensive regression stages if the documented,
 * disposable loopback database is not available. The connection callback is
 * injected so tests can verify the guard without opening a socket.
 */
export async function assertRegressionDatabaseAvailable(
  value: string,
  connect: (url: string) => Promise<void>,
): Promise<void> {
  const url = regressionDatabaseURL(value);
  try {
    await connect(url.href);
  } catch {
    throw new Error(
      `Disposable regression Postgres is unavailable at ${url.host}${url.pathname}. Start the loopback test database with:\n\n${localDatabaseSetup}\n\nThen rerun npm run test:regression. See docs/testing/regression-policy.md#local-setup. This runner never connects to Preview or Production databases.`,
    );
  }
}

export function localTestDatabase(env: Record<string, string | undefined>): string | undefined {
  if (env.DRIP_CLOUD_E2E !== "1") return undefined;
  const denied = () => new Error("Cloud browser tests require an isolated loopback database and origin; deployment targets are forbidden.");
  if (env.VERCEL || env.VERCEL_ENV || !env.DATABASE_URL || env.DATABASE_URL !== env.DRIP_TEST_DATABASE_URL) throw denied();
  let origin: URL;
  try { regressionDatabaseURL(env.DATABASE_URL, true); origin = new URL(env.BETTER_AUTH_URL ?? ""); } catch { throw denied(); }
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw denied();
  return env.DATABASE_URL;
}
