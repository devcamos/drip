import { afterEach, beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  pool: vi.fn(function (this: { options: unknown }, options: unknown) { this.options = options; }),
  auth: vi.fn(() => ({ handler: vi.fn() })),
  socket: vi.fn(),
  proxy: vi.fn(function (this: { proxy: string }, proxy: string) { this.proxy = proxy; }),
}));
vi.mock("@neondatabase/serverless", () => ({ Pool: runtime.pool, neonConfig: {} }));
vi.mock("better-auth", () => ({ betterAuth: runtime.auth }));
vi.mock("ws", () => ({ default: class { constructor(...args: unknown[]) { runtime.socket(...args); } } }));
vi.mock("https-proxy-agent", () => ({ HttpsProxyAgent: runtime.proxy }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://synthetic.invalid/drip");
  vi.stubEnv("BETTER_AUTH_URL", "https://synthetic.drip.invalid/");
  vi.stubEnv("BETTER_AUTH_SECRET", "Synthetic-only-auth-test-secret-42!");
  vi.stubEnv("HTTPS_PROXY", "");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"])("fails closed when %s is missing", async key => {
  vi.stubEnv(key, "");
  const auth = await import("../server/auth");
  expect(auth.cloudConfigured()).toBe(false);
  expect(() => auth.getAuth()).toThrow("Cloud recovery is not configured.");
  expect(runtime.auth).not.toHaveBeenCalled();
});

it("uses the configured origin, hardened auth options and a bounded shared pool", async () => {
  const auth = await import("../server/auth");
  expect(auth.cloudConfigured()).toBe(true);
  const options = auth.authOptions();
  expect(options).toMatchObject({
    baseURL: "https://synthetic.drip.invalid/", trustedOrigins: ["https://synthetic.drip.invalid"],
    emailAndPassword: { enabled: true, minPasswordLength: 32, requireEmailVerification: false },
    user: { changeEmail: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    session: { additionalFields: { dripDeviceId: { input: false, returned: false } } },
  });
  expect(options.plugins.map(plugin => plugin.id)).toEqual(["passkey", "drip-gamertag-password"]);
  expect(options.databaseHooks.session.create.before).toBeTypeOf("function");
  expect(auth.getAuth()).toBe(auth.getAuth());
  expect(runtime.auth).toHaveBeenCalledOnce();
  expect(runtime.pool).toHaveBeenCalledOnce();
  expect(runtime.pool).toHaveBeenCalledWith(expect.objectContaining({ max: 3, connectionString: "postgres://synthetic.invalid/drip" }));
  expect(auth.database()).toBe(options.database);
});

it("rejects an invalid auth URL before constructing a database pool", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "invalid");
  const auth = await import("../server/auth");
  expect(() => auth.authOptions()).toThrow();
  expect(runtime.pool).not.toHaveBeenCalled();
});

it.each([false, true])("selects a direct or proxy WebSocket without making a connection (proxy: %s)", async proxy => {
  if (proxy) vi.stubEnv("HTTPS_PROXY", "http://synthetic-proxy.invalid:8080");
  await import("../server/auth");
  const { neonConfig } = await import("@neondatabase/serverless");
  const Socket = neonConfig.webSocketConstructor as unknown as new (...args: unknown[]) => unknown;
  new Socket("wss://synthetic.invalid", ["synthetic"]);
  expect(runtime.socket).toHaveBeenCalledWith("wss://synthetic.invalid", ["synthetic"], ...(proxy ? [expect.objectContaining({ agent: expect.any(Object) })] : []));
  expect(runtime.proxy).toHaveBeenCalledTimes(proxy ? 1 : 0);
});
