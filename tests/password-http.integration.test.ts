import { afterEach, beforeEach, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ auth: undefined as unknown }));
vi.mock("../server/auth", () => ({ getAuth: () => backend.auth, cloudConfigured: () => true }));
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { passwordLogin } from "../server/password-login";
import { deviceSessionHooks } from "../server/device-sessions";
import { POST } from "../app/api/auth/[...all]/route";
import { passwordProof, unwrapPasswordRoot, wrapPasswordRoot, type PasswordWrap } from "../lib/password-crypto";
import { recoveryCredentials } from "../lib/cloud";
import { fixtureCode } from "./storage-fixtures";

const origin = "http://localhost:4321";
const device = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const password = "Synthetic river 42!";
type Credential = { user_id: string; password_hash: string; envelope: PasswordWrap };

/** Real Better Auth routing, validation, hashing, cookies and session hooks.
 * Only storage is replaced: an auth memory adapter and a strict SQL double for
 * Drip's tables. Database syntax/locking is covered by isolated-DB browser tests.
 */
async function fixture() {
  const memory: Record<string, Record<string, any>[]> = { user: [], account: [], session: [], verification: [], rateLimit: [] };
  const credentials = new Map<string, Credential>();
  const faults = { limited: false, database: false, rapid: false };
  const client = { release() {}, async query(sql: string, args: any[] = []): Promise<{ rows: Record<string, any>[] }> {
    if (faults.database) throw Object.assign(new Error("synthetic private database detail"), { code: "42P01" });
    if (["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith('SELECT id FROM "user"')) return { rows: memory.user.filter(row => row.id === args[0]) };
    if (sql.startsWith("INSERT INTO drip_recovery_limits")) return { rows: [{ key: "login:global", hits: faults.limited ? 301 : 1 }] };
    if (sql.startsWith("SELECT user_id, password_hash, envelope")) return { rows: credentials.has(args[0]) ? [credentials.get(args[0])!] : [] };
    if (sql.startsWith("SELECT user_id FROM drip_password_login")) return { rows: [...credentials.entries()].filter(([name, row]) => name === args[1] && row.user_id === args[0] && row.password_hash === args[2]).map(([, row]) => row) };
    if (sql.startsWith("SELECT login.user_id")) {
      const row = credentials.get(args[1]);
      return { rows: row && row.user_id === args[0] && row.password_hash === args[2] && (!args[4] || row.envelope.ct === args[4]) && memory.session.some(session => session.id === args[3] && session.userId === args[0]) ? [row] : [] };
    }
    if (sql.startsWith("WITH saved AS")) {
      credentials.set(args[1], { user_id: args[0], password_hash: args[2], envelope: JSON.parse(args[3]) });
      memory.session = memory.session.filter(row => row.userId !== args[0] || row.id === args[4]);
      return { rows: [{ user_id: args[0] }] };
    }
    if (sql.startsWith('SELECT id, "dripDeviceId"')) return { rows: memory.session.filter(row => row.userId === args[0] && new Date(row.expiresAt).getTime() > Date.now()) };
    if (sql.startsWith('DELETE FROM "session"')) {
      memory.session = memory.session.filter(row => !(sql.includes('"dripDeviceId" = $2') ? row.userId === args[0] && row.dripDeviceId === args[1] && row.id !== args[2] : row.id === args[0] && row.userId === args[1]));
      return { rows: [] };
    }
    throw new Error("Unexpected SQL in auth integration fixture");
  } };
  const db = { query: client.query, connect: async () => client } as any;
  const auth = betterAuth({
    baseURL: origin, secret: "Synthetic-only-auth-test-secret-42!", database: memoryAdapter(memory), trustedOrigins: [origin],
    emailAndPassword: { enabled: true, minPasswordLength: 32 },
    session: { additionalFields: { dripDeviceId: { type: "string", input: false, returned: false, required: false } } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    databaseHooks: deviceSessionHooks(db), plugins: [passwordLogin(db)], logger: { disabled: true },
  });
  backend.auth = auth;
  const send = (path: string, body?: unknown, browser = 1, cookie?: string, owner?: string, headers?: Record<string, string>) => {
    // Ordinary journeys span the library's ten-second sign-in window. A
    // separate rapid-attempt test below keeps time fixed to assert that gate.
    if (!faults.rapid) vi.setSystemTime(Date.now() + 11_000);
    const request = new Request(`${origin}/api/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, "content-type": "application/json", "x-drip-device": device(browser), ...(cookie ? { cookie } : {}), ...(owner ? { "x-drip-owner": owner } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return POST(request);
  };
  const recovery = await recoveryCredentials(fixtureCode);
  const created = await send("sign-up/email", { ...recovery, name: "Synthetic" });
  expect(created.status).toBe(200);
  const owner = (await created.json()).user.id as string;
  const cookie = cookies(created);
  const envelope = await wrapPasswordRoot(fixtureCode, "http_user", password, owner);
  const proof = await passwordProof("http_user", password);
  const setup = await send("gamertag-password", { username: "http_user", proof, recoveryProof: recovery.password, envelope }, 1, cookie, owner);
  expect(setup.status).toBe(200);
  expect((await send("sign-out", {}, 1, cookie)).status).toBe(200);
  const login = (browser = 1, secret = password, name = "http_user") => passwordProof(name, secret).then(proof => send("sign-in/gamertag", { username: name, proof, expectedOwner: owner, expectedEnvelope: envelope.ct }, browser));
  return { send, login, owner, envelope, proof, memory, credentials, faults, recovery };
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.stubEnv("BETTER_AUTH_URL", origin); vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("preflights without a session, then signs in with a real cookie and the same encrypted account key", async () => {
  const f = await fixture();
  const preflight = await f.send("sign-in/gamertag-key", { username: "http_user", proof: f.proof });
  expect(preflight.status).toBe(200); expect(preflight.headers.has("set-cookie")).toBe(false); expect(f.memory.session).toHaveLength(0);
  expect(await preflight.json()).toEqual({ owner: f.owner, envelope: f.envelope });
  const signed = await f.login();
  expect(signed.status).toBe(200); expect(cookies(signed)).toContain("session_token=");
  expect(signed.headers.get("cache-control")).toBe("no-store");
  expect(await unwrapPasswordRoot((await signed.json()).envelope, "http_user", password)).toBe(fixtureCode);
  const session = await f.send("get-session", undefined, 1, cookies(signed));
  expect((await session.json()).user.id).toBe(f.owner);
});

it("gives the same safe denial for wrong passwords and unknown gamertags without issuing sessions", async () => {
  const f = await fixture();
  for (const [name, secret] of [["http_user", "Incorrect password 42!"], ["unknown_user", password]]) {
    const response = await f.login(1, secret, name);
    expect(response.status).toBe(401); expect(response.headers.has("set-cookie")).toBe(false);
    expect((await response.json()).message).toBe("Gamertag or password is incorrect.");
  }
  expect(f.memory.session).toHaveLength(0);
});

it("rejects malformed credentials and untrusted origins through the actual route", async () => {
  const f = await fixture();
  const invalid = await f.send("sign-in/gamertag", { username: "http_user", proof: "short" });
  expect(invalid.status).toBe(400); expect(invalid.headers.has("set-cookie")).toBe(false);
  const untrusted = await f.send("sign-in/gamertag", { username: "http_user", proof: f.proof }, 1, undefined, undefined, { origin: "https://untrusted.invalid" });
  expect(untrusted.status).toBe(403); expect(untrusted.headers.has("set-cookie")).toBe(false);
  expect(f.memory.session).toHaveLength(0);
});

it("enforces Better Auth's rapid-attempt limiter in addition to Drip's login limiter", async () => {
  const f = await fixture(); f.faults.rapid = true;
  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await f.login(1, "Wrong synthetic password!");
    statuses.push(response.status); expect(response.headers.has("set-cookie")).toBe(false);
  }
  expect(statuses).toContain(401); expect(statuses.at(-1)).toBe(429);
  expect(f.memory.session).toHaveLength(0);
});

it("returns a durable-login rate-limit response before issuing a cookie", async () => {
  const f = await fixture(); f.faults.limited = true;
  const denied = await f.login();
  expect(denied.status).toBe(429); expect(denied.headers.has("set-cookie")).toBe(false);
  expect((await denied.json()).message).toMatch(/Too many sign-in attempts/);
  expect(f.memory.session).toHaveLength(0);
});

it("bounds real gamertag sessions to two devices and renews the same browser", async () => {
  const f = await fixture();
  expect((await f.login(1)).status).toBe(200); expect((await f.login(2)).status).toBe(200);
  const denied = await f.login(3);
  expect(denied.status).toBe(409); expect(denied.headers.has("set-cookie")).toBe(false);
  expect((await denied.json()).code).toBe("DEVICE_LIMIT_REACHED"); expect(f.memory.session).toHaveLength(2);
  const previous = f.memory.session.find(row => row.dripDeviceId === device(1))!.token;
  expect((await f.login(1)).status).toBe(200); expect(f.memory.session).toHaveLength(2);
  expect(f.memory.session.some(row => row.token === previous)).toBe(false);
});

it("sanitizes a database failure at the HTTP boundary without cookies or private details", async () => {
  const f = await fixture(); f.faults.database = true;
  const response = await f.login();
  expect(response.status).toBeGreaterThanOrEqual(500); expect(response.headers.has("set-cookie")).toBe(false);
  const value = await response.json(); expect(value.code).toBe("AUTH_UNAVAILABLE");
  expect(value.requestId).toBe(response.headers.get("x-drip-request-id"));
  expect(JSON.stringify(value)).not.toMatch(/private|42P01|database detail/);
  expect(f.memory.session).toHaveLength(0);
});

it("resets a password using verified recovery, revokes other devices and preserves the root", async () => {
  const f = await fixture(); const signed = await f.login(1); expect((await f.login(2)).status).toBe(200);
  const next = "Synthetic waterfall 73!";
  const envelope = await wrapPasswordRoot(fixtureCode, "http_user", next, f.owner);
  const response = await f.send("gamertag-password", { username: "http_user", proof: await passwordProof("http_user", next), recoveryProof: f.recovery.password, envelope }, 1, cookies(signed), f.owner);
  expect(response.status).toBe(200); expect(f.memory.session).toHaveLength(1);
  expect((await f.login(1)).status).toBe(401);
  const renewed = await f.send("sign-in/gamertag", { username: "http_user", proof: await passwordProof("http_user", next), expectedOwner: f.owner, expectedEnvelope: envelope.ct }, 1);
  expect(renewed.status).toBe(200);
  expect(await unwrapPasswordRoot((await renewed.json()).envelope, "http_user", next)).toBe(fixtureCode);
});
