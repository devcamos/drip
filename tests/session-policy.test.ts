import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { authOptions } from "../server/auth";

const origin = "https://drip-session-tests.example";
const day = 86_400_000;
const password = "Synthetic-session-policy-password-only-42!";

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", "Synthetic-session-policy-secret-only-42!");
  vi.stubEnv("DATABASE_URL", "postgres://synthetic:synthetic@127.0.0.1:1/unused");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const memory: Record<string, Record<string, any>[]> = { user: [], session: [], account: [], verification: [], passkey: [] };
  // Real Better Auth HTTP/cookies/adapter using Drip's actual session options.
  // External DB, device admission and password plugins have their own integration
  // suites; this isolated adapter does not connect to any hosted service.
  const options = authOptions();
  const createAuth = () => betterAuth({ ...options, database: memoryAdapter(memory), databaseHooks: undefined, plugins: [options.plugins[0]], rateLimit: { enabled: false } });
  const auth = createAuth();
  const send = (path: string, cookie = "", body?: unknown) => auth.handler(new Request(`${origin}/api/auth/${path}`, {
    method: body ? "POST" : "GET", headers: { origin, cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const signup = await send("sign-up/email", "", { email: "session@recovery.drip.invalid", password, name: "Synthetic" });
  expect(signup.status).toBe(200);
  const cookies = signup.headers.getSetCookie();
  const token = cookies.find(value => value.startsWith("__Secure-better-auth.session_token="));
  expect(token).toBeDefined();
  expect(cookies.some(value => value.startsWith("__Secure-better-auth.session_data="))).toBe(false);
  return { memory, send, createAuth, token: token!, cookie: token!.split(";")[0] };
}

it("sets a persistent host-only HTTPS cookie without a readable session cache", async () => {
  const { token, memory } = await setup();
  expect(token).toMatch(/; HttpOnly/i);
  expect(token).toMatch(/; Secure/i);
  expect(token).toMatch(/; SameSite=Lax/i);
  expect(token).toMatch(/; Path=\//i);
  expect(token).not.toMatch(/; Domain=/i);
  expect(token).toContain("Max-Age=604800");
  expect(new Date(memory.session[0].expiresAt).getTime() - new Date(memory.session[0].createdAt).getTime()).toBeCloseTo(7 * day, -3);
});

it("keeps the original expiry after later activity rather than sliding forever", async () => {
  const { memory, send, cookie } = await setup();
  const expiresAt = new Date(Date.now() + 5 * day);
  Object.assign(memory.session[0], { createdAt: new Date(Date.now() - 2 * day), updatedAt: new Date(Date.now() - 2 * day), expiresAt });
  const response = await send("get-session", cookie);
  expect(response.status).toBe(200);
  expect((await response.json()).user.name).toBe("Synthetic");
  expect(new Date(memory.session[0].expiresAt).getTime()).toBe(expiresAt.getTime());
  expect(response.headers.getSetCookie()).toEqual([]);
});

it("accepts an unchanged cookie after the auth instance restarts with the same configuration and database", async () => {
  const { createAuth, cookie, memory } = await setup();
  const response = await createAuth().handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }));
  expect((await response.json()).user.name).toBe("Synthetic");
  expect(memory.session).toHaveLength(1);
});

it("requires recent authentication for cloud passkey registration without ending ordinary access", async () => {
  const { memory, send, cookie } = await setup();
  expect((await send("passkey/generate-register-options", cookie)).status).toBe(200);
  memory.session[0].createdAt = new Date(Date.now() - 6 * 60_000);
  const registration = await send("passkey/generate-register-options", cookie);
  expect(registration.status).toBe(403);
  expect((await registration.json()).code).toBe("SESSION_NOT_FRESH");
  expect((await (await send("get-session", cookie)).json()).user.name).toBe("Synthetic");
});

it("rejects an expired cookie and removes the expired server session", async () => {
  const { memory, send, cookie } = await setup();
  memory.session[0].expiresAt = new Date(Date.now() - 1000);
  expect(await (await send("get-session", cookie)).json()).toBeNull();
  expect(memory.session).toHaveLength(0);
});

it("rejects a revoked cookie immediately after a successful session lookup", async () => {
  const { memory, send, cookie } = await setup();
  expect((await (await send("get-session", cookie)).json()).user.name).toBe("Synthetic");
  memory.session.splice(0);
  expect(await (await send("get-session", cookie)).json()).toBeNull();
});

it("sign-out invalidates the old cookie instead of only clearing the browser", async () => {
  const { memory, send, cookie } = await setup();
  expect((await send("sign-out", cookie, {})).status).toBe(200);
  expect(memory.session).toHaveLength(0);
  expect(await (await send("get-session", cookie)).json()).toBeNull();
});

it("rejects tampered session cookies", async () => {
  const { send, cookie } = await setup();
  expect(await (await send("get-session", cookie + "tampered")).json()).toBeNull();
});
