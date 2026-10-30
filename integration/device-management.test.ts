import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { passwordLogin } from "../server/password-login";
import { deviceSessionHooks, guardDeviceAuthResponse } from "../server/device-sessions";
import { passwordProof, wrapPasswordRoot } from "../lib/password-crypto";
import { generateRecoveryCode } from "../lib/crypto";
import { deviceName } from "../server/manage-devices";
import type { Pool as NeonPool } from "@neondatabase/serverless";

const url = new URL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/drip_notifications_test") throw new Error("Device integration tests require the isolated loopback test database.");
const schema = `devices_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 6 });
// Production uses Neon Pool; pg exercises its identical SQL/transaction surface
// against a real guarded loopback database without any hosted credentials.
const authPool = pool as unknown as NeonPool;
const origin = "http://localhost:4321";
const devices = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const password = "Synthetic garden 42!";
const createAuth = () => betterAuth({ database: pool, baseURL: origin, secret: "Synthetic-only-device-management-test-42!", trustedOrigins: [origin],
  emailAndPassword: { enabled: true }, rateLimit: { enabled: false }, plugins: [passwordLogin(authPool)], databaseHooks: deviceSessionHooks(authPool),
  session: { additionalFields: { dripDeviceId: { type: "string", input: false, returned: false, required: false } } },
});
let auth: ReturnType<typeof createAuth>;
const send = (path: string, body: object, device = devices[2], cookie = "") => guardDeviceAuthResponse(() => auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { origin, "content-type": "application/json", "x-drip-device": device, cookie, "user-agent": "Mozilla/5.0 (iPhone) Version/18.0 Safari/605.1.15" }, body: JSON.stringify(body) })));
const cookieFrom = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
async function session(cookie: string) { return (await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }))).json(); }
async function owner() {
  const username = "dv_" + randomUUID().replaceAll("-", "").slice(0, 10);
  const signed = await send("sign-up/email", { name: username, email: username + "@recovery.drip.invalid", password }, devices[0]);
  expect(signed.status).toBe(200); const user = (await signed.json()).user;
  const proof = await passwordProof(username, password), context = await auth.$context;
  const envelope = await wrapPasswordRoot(generateRecoveryCode(), username, password, user.id);
  await pool.query("INSERT INTO drip_password_login (user_id,username,password_hash,envelope) VALUES ($1,$2,$3,$4)", [user.id, username, await context.password.hash(proof), envelope]);
  return { id: user.id, username, proof, cookie: cookieFrom(signed) };
}
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`
    CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, "emailVerified" boolean NOT NULL DEFAULT false, image text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
    CREATE TABLE "session" (id text PRIMARY KEY, token text UNIQUE NOT NULL, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text, "dripDeviceId" text);
    CREATE TABLE "account" (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
    CREATE TABLE "verification" (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz, "updatedAt" timestamptz);
    CREATE TABLE drip_password_login (user_id text PRIMARY KEY REFERENCES "user"(id), username text UNIQUE NOT NULL, password_hash text NOT NULL, envelope jsonb NOT NULL);
    CREATE TABLE drip_recovery_limits (key text PRIMARY KEY, bucket timestamptz NOT NULL, hits integer NOT NULL);
  `);
  auth = createAuth();
  await auth.$context;
});
afterEach(async () => { await pool.query("TRUNCATE drip_recovery_limits"); });
afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); vi.unstubAllEnvs(); });

it("lets a third browser verify, revoke an old device and sign in; the old cookie stops working and the cap remains two", async () => {
  const a = await owner(); const credentials = { username: a.username, proof: a.proof };
  const b = await send("sign-in/gamertag", credentials, devices[1]); expect(b.status).toBe(200); const cookieB = cookieFrom(b);
  const denied = await send("sign-in/gamertag", credentials); expect(denied.status).toBe(409); expect(denied.headers.has("set-cookie")).toBe(false);
  const listing = await send("sign-in/gamertag-devices", credentials); expect(listing.status).toBe(200); expect(listing.headers.has("set-cookie")).toBe(false); expect(listing.headers.get("cache-control")).toBe("no-store");
  const value = await listing.json(); expect(value.devices).toHaveLength(2); expect(JSON.stringify(value)).not.toMatch(/token|ipAddress|userAgent|password|envelope|proof/);
  const old = (await pool.query('SELECT id FROM "session" WHERE "userId"=$1 AND "dripDeviceId"=$2', [a.id, devices[0]])).rows[0].id;
  const removal = await send("sign-in/gamertag-revoke-device", { ...credentials, sessionId: old }); expect(await removal.json()).toEqual({ removed: true, current: false }); expect(removal.headers.has("set-cookie")).toBe(false);
  expect(await session(a.cookie)).toBeNull(); expect((await session(cookieB)).user.id).toBe(a.id);
  const c = await send("sign-in/gamertag", credentials); expect(c.status).toBe(200); expect((await session(cookieFrom(c))).user.id).toBe(a.id);
  expect(Number((await pool.query('SELECT count(*) FROM "session" WHERE "userId"=$1 AND "expiresAt">now()', [a.id])).rows[0].count)).toBe(2);
});
it("never lists devices for bad credentials and cannot revoke another owner's session", async () => {
  const a = await owner(), b = await owner();
  const bad = await send("sign-in/gamertag-devices", { username: a.username, proof: "x".repeat(43) }); expect(bad.status).toBe(401); expect((await bad.json()).devices).toBeUndefined();
  const target = (await pool.query('SELECT id FROM "session" WHERE "userId"=$1', [b.id])).rows[0].id;
  const removal = await send("sign-in/gamertag-revoke-device", { username: a.username, proof: a.proof, sessionId: target }); expect(await removal.json()).toEqual({ removed: false, current: false }); expect((await session(b.cookie)).user.id).toBe(b.id);
});
it("revokes this browser, treats expired/deleted sessions idempotently and rejects malformed/extra input", async () => {
  const a = await owner(), credentials = { username: a.username, proof: a.proof };
  const listing = await send("sign-in/gamertag-devices", credentials, devices[0], a.cookie); const list = (await listing.json()).devices;
  expect(list).toHaveLength(1); expect(list[0].current).toBe(true);
  const removal = await send("sign-in/gamertag-revoke-device", { ...credentials, sessionId: list[0].id }, devices[0], a.cookie); expect(await removal.json()).toEqual({ removed: true, current: true }); expect(await session(a.cookie)).toBeNull();
  expect(await (await send("sign-in/gamertag-revoke-device", { ...credentials, sessionId: list[0].id })).json()).toEqual({ removed: false, current: false });
  expect((await send("sign-in/gamertag-devices", { ...credentials, userId: "other" })).status).toBe(400);
  expect((await send("sign-in/gamertag-revoke-device", { ...credentials, sessionId: "" })).status).toBe(400);
});
it("serializes simultaneous revoke/login requests without admitting a third active session", async () => {
  const a = await owner(), credentials = { username: a.username, proof: a.proof };
  expect((await send("sign-in/gamertag", credentials, devices[1])).status).toBe(200);
  const target = (await pool.query('SELECT id FROM "session" WHERE "userId"=$1 AND "dripDeviceId"=$2', [a.id, devices[0]])).rows[0].id;
  const [removal, candidate] = await Promise.all([send("sign-in/gamertag-revoke-device", { ...credentials, sessionId: target }), send("sign-in/gamertag", credentials)]);
  expect(removal.status).toBe(200); expect([200, 409]).toContain(candidate.status);
  expect(Number((await pool.query('SELECT count(*) FROM "session" WHERE "userId"=$1 AND "expiresAt">now()', [a.id])).rows[0].count)).toBeLessThanOrEqual(2);
});
it.each([
  ["Mozilla/5.0 (iPhone) Version/18.0 Safari/605.1.15", "Safari on iPhone"], ["Mozilla/5.0 (iPad) FxiOS/18.0", "Firefox on iPad"],
  ["Mozilla/5.0 (Windows) Chrome/130.0 Edg/130.0", "Edge on Windows"], ["Mozilla/5.0 (Android) Chrome/130.0", "Chrome on Android"],
  [null, "Unknown browser"], ["Mozilla/5.0 (Macintosh)", "Browser on Mac"], ["Firefox/130.0 Linux", "Firefox on Linux"],
])("uses a safe estimated label for %s", (agent, expected) => { expect(deviceName(agent ?? undefined)).toBe(expected); });
