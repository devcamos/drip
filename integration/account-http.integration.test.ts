import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "../server/auth";
import { regressionDatabaseURL } from "../server/local-test-database";
import { migrationStatements } from "../tools/regression/policy.mjs";
import { databaseTypes } from "../server/database-types";
import { deviceSessionHooks } from "../server/device-sessions";
import { passwordLogin } from "../server/password-login";
import { generateRecoveryCode, decryptBackup, deriveCloudEncryptionKey } from "../lib/crypto";
import { createRecoveryCodes } from "../lib/recovery-codes";
import { recoveryCredentials, seal, unseal } from "../lib/cloud";
import { passwordProof, wrapPasswordRoot, unwrapPasswordRoot } from "../lib/password-crypto";
import { calendarAccount } from "../tests/payment-calendar-fixtures";
import type { Pool as NeonPool } from "@neondatabase/serverless";

type RouteAuth = { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null> } };
const wired = vi.hoisted(() => ({ db: undefined as unknown as NeonPool, auth: undefined as unknown as RouteAuth }));
// Only the factory connection is injected. Route handlers, Better Auth, queries,
// transactions, limits, hashing and crypto all execute against real Postgres.
vi.mock("../server/auth", async original => ({ ...await original<typeof import("../server/auth")>(), database: () => wired.db, getAuth: () => wired.auth }));
import * as authRoute from "../app/api/auth/[...all]/route";
import * as vaultRoute from "../app/api/cloud/route";
import * as recoveryRoute from "../app/api/recovery-codes/route";

const url = regressionDatabaseURL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
const schema = "account_http_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, types: databaseTypes, max: 8 });
const origin = "http://localhost:4321", password = "Synthetic account meadow 42!";
const device = () => randomUUID();
let server: Server, transport = "";
let options: ReturnType<typeof authOptions>;
const cookie = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

async function startAuth() {
  const auth = betterAuth({ ...options, database: pool, databaseHooks: deviceSessionHooks(wired.db), plugins: [options.plugins[0], passwordLogin(wired.db)] });
  await (await auth.$context).checkSchema?.();
  wired.auth = auth;
}
async function send(path: string, body?: unknown, session = "", owner = "", browser = device(), requestOrigin = origin) {
  return fetch(transport + path, { method: body === undefined ? "GET" : "POST", redirect: "manual", headers: {
    origin: requestOrigin, "content-type": "application/json", cookie: session, "x-drip-device": browser,
    ...(owner ? { "x-drip-owner": owner } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function put(path: string, body: unknown, session: string, owner: string, requestOrigin = origin) {
  return fetch(transport + path, { method: "PUT", redirect: "manual", headers: { origin: requestOrigin, "content-type": "application/json", cookie: session, "x-drip-owner": owner }, body: JSON.stringify(body) });
}
async function createAccount() {
  const root = generateRecoveryCode(), username = "rg_" + randomUUID().replaceAll("-", "").slice(0, 10), browser = device();
  const credentials = await recoveryCredentials(root);
  const signup = await send("/api/auth/sign-up/email", { ...credentials, name: username }, "", "", browser);
  expect(signup.status).toBe(200);
  const owner = (await signup.json()).user.id as string, session = cookie(signup);
  const data = { version: 1 as const, identity: { id: randomUUID(), handle: username, createdAt: "2026-10-31" }, accounts: [calendarAccount({ investment: { shares: 20, averagePriceGBP: 50 } })], snapshots: [], lastBackupAt: null };
  const key = await deriveCloudEncryptionKey(root), envelope = await seal(data, key);
  expect((await put("/api/cloud", { version: 0, envelope }, session, owner)).status).toBe(200);
  const proof = await passwordProof(username, password), wrap = await wrapPasswordRoot(root, username, password, owner);
  const setup = await send("/api/auth/gamertag-password", { username, proof, recoveryProof: credentials.password, envelope: wrap }, session, owner, browser);
  expect(setup.status).toBe(200);
  return { root, username, browser, credentials, owner, session, data, key, envelope, proof, wrap };
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", url.href); vi.stubEnv("BETTER_AUTH_URL", origin); vi.stubEnv("BETTER_AUTH_SECRET", "Synthetic-account-contract-secret-only-42!"); vi.stubEnv("VERCEL_ENV", "");
  wired.db = pool as unknown as NeonPool;
  await admin.query(`CREATE SCHEMA ${schema}`);
  options = authOptions();
  // Native auth schema from the installed version; app-specific SQL from the
  // actual migration script. A changed/nonliteral query fails this fixture.
  const migration = await getMigrations({ ...options, database: pool });
  await migration.runMigrations();
  for (const sql of migrationStatements(readFileSync(new URL("../scripts/migrate.mjs", import.meta.url), "utf8"))) await pool.query(sql);
  await startAuth();
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers(); for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const path = incoming.url ?? "/", method = incoming.method ?? "GET";
      const request = new Request(origin + path, { method, headers, ...(method === "GET" ? {} : { body: Buffer.concat(chunks).toString("utf8") }) });
      const handlers: Record<string, (request: Request) => Promise<Response>> = path.startsWith("/api/auth/") ? { GET: authRoute.GET, POST: authRoute.POST } : path === "/api/cloud" ? { GET: vaultRoute.GET, PUT: vaultRoute.PUT } : { GET: recoveryRoute.GET, PUT: recoveryRoute.PUT, POST: recoveryRoute.POST };
      const handler = handlers[method];
      const response = handler ? await handler(request) : new Response(null, { status: 405 });
      outgoing.statusCode = response.status;
      for (const [key, value] of response.headers) if (key !== "set-cookie") outgoing.setHeader(key, value);
      const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.statusCode = 500; outgoing.end("Integration handler failed"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No loopback test listener");
  transport = `http://127.0.0.1:${address.port}`;
}, 30_000);
beforeEach(async () => { await pool.query('TRUNCATE "user" CASCADE'); await pool.query('TRUNCATE "rateLimit", drip_recovery_limits'); });
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); vi.unstubAllEnvs();
});

it("signs up, saves encrypted investment data and restores it using gamertag/password on a fresh device", async () => {
  const a = await createAccount();
  expect((await send("/api/auth/sign-out", {}, a.session)).status).toBe(200);
  const signed = await send("/api/auth/sign-in/gamertag", { username: a.username, proof: a.proof });
  expect(signed.status).toBe(200); expect(signed.headers.get("cache-control")).toBe("no-store");
  expect(await unwrapPasswordRoot((await signed.json()).envelope, a.username, password)).toBe(a.root);
  const vault = await send("/api/cloud", undefined, cookie(signed), a.owner);
  const stored = await vault.json(); expect(stored.version).toBe(1); expect(stored.envelope.v).toBe(2);
  expect((await unseal(stored.envelope, a.key)).accounts[0].investment).toEqual({ shares: 20, averagePriceGBP: 50 });
  expect(JSON.stringify(stored)).not.toMatch(/averagePriceGBP|Realty Income|1200/);
});

it("keeps existing credentials, cookies and fixed expiry across an auth process restart", async () => {
  const a = await createAccount();
  const before = (await pool.query('SELECT "expiresAt" FROM "session" WHERE "userId"=$1', [a.owner])).rows[0].expiresAt;
  await startAuth();
  const response = await send("/api/auth/get-session", undefined, a.session);
  expect((await response.json()).user.id).toBe(a.owner);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect((await pool.query('SELECT "expiresAt" FROM "session" WHERE "userId"=$1', [a.owner])).rows[0].expiresAt).toEqual(before);
  expect((await send("/api/auth/sign-in/gamertag", { username: a.username, proof: a.proof })).status).toBe(200);
});

it("rejects wrong credentials without cookies or an extra admitted session", async () => {
  const a = await createAccount();
  for (const credentials of [{ username: a.username, proof: "A".repeat(43) }, { username: "unknown_saver", proof: a.proof }]) {
    const response = await send("/api/auth/sign-in/gamertag", credentials);
    expect(response.status).toBe(401); expect(response.headers.getSetCookie()).toEqual([]);
  }
  expect(Number((await pool.query('SELECT count(*) FROM "session" WHERE "userId"=$1', [a.owner])).rows[0].count)).toBe(1);
});

it("enforces the native sign-in burst limit with usable Retry-After seconds", async () => {
  const a = await createAccount();
  for (let attempt = 0; attempt < 3; attempt++) {
    expect((await send("/api/auth/sign-in/gamertag", { username: a.username, proof: "A".repeat(43) })).status).toBe(401);
  }
  const limited = await send("/api/auth/sign-in/gamertag", { username: a.username, proof: "A".repeat(43) });
  expect(limited.status).toBe(429); expect(limited.headers.getSetCookie()).toEqual([]);
  const seconds = Number(limited.headers.get("retry-after") ?? limited.headers.get("x-retry-after"));
  expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(10);
});

it("enforces the durable account/IP minute budget and tells clients when they can retry", async () => {
  const a = await createAccount();
  // Put real persisted counters at their boundary, without waiting a minute or
  // mocking the datastore. The next request must run the actual SQL increment.
  await pool.query("UPDATE drip_recovery_limits SET hits=20, bucket=date_trunc('minute', now()) WHERE key LIKE 'login:name:%' OR key LIKE 'login:ip:%'");
  const limited = await send("/api/auth/sign-in/gamertag", { username: a.username, proof: "A".repeat(43) });
  expect(limited.status).toBe(429); expect(limited.headers.getSetCookie()).toEqual([]);
  const seconds = Number(limited.headers.get("retry-after"));
  expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(60);
  expect(Number((await pool.query('SELECT count(*) FROM "session" WHERE "userId"=$1', [a.owner])).rows[0].count)).toBe(1);
});

it("isolates owners and atomically rejects a stale concurrent cloud write", async () => {
  const a = await createAccount(), b = await createAccount();
  expect((await send("/api/cloud", undefined, b.session, a.owner)).status).toBe(401);
  const outcomes = await Promise.all([put("/api/cloud", { version: 1, envelope: a.envelope }, a.session, a.owner), put("/api/cloud", { version: 1, envelope: a.envelope }, a.session, a.owner)]);
  expect(outcomes.map(response => response.status).sort()).toEqual([200, 409]);
  expect((await (await send("/api/cloud", undefined, a.session, a.owner)).json()).version).toBe(2);
  expect((await (await send("/api/cloud", undefined, b.session, b.owner)).json()).version).toBe(1);
});

it("rejects missing sessions, incorrect origin and plaintext cloud payloads before replacement", async () => {
  const a = await createAccount();
  expect((await put("/api/cloud", { version: 1, envelope: a.envelope }, "", a.owner)).status).toBe(401);
  expect((await put("/api/cloud", { version: 1, envelope: a.envelope }, a.session, a.owner, "https://other.invalid")).status).toBe(403);
  expect((await put("/api/cloud", { version: 1, envelope: a.data }, a.session, a.owner)).status).toBe(400);
  expect((await (await send("/api/cloud", undefined, a.session, a.owner)).json()).version).toBe(1);
});

it("stores one original six-code set, supports idempotent retries and returns only the encrypted recovery wrapper", async () => {
  const a = await createAccount(), original = await createRecoveryCodes(a.root);
  expect((await put("/api/recovery-codes", { records: original.records }, a.session, a.owner)).status).toBe(200);
  expect((await put("/api/recovery-codes", { records: original.records }, a.session, a.owner)).status).toBe(200);
  const replacement = await createRecoveryCodes(a.root);
  expect((await put("/api/recovery-codes", { records: replacement.records }, a.session, a.owner)).status).toBe(409);
  const found = await send("/api/recovery-codes", { locator: original.records[0].locator });
  expect(found.status).toBe(200);
  const value = await found.json(); expect(Object.keys(value)).toEqual(["envelope"]);
  expect(await decryptBackup(value.envelope, original.codes[0])).toEqual({ purpose: "drip-recovery-root-v1", root: a.root });
  expect(JSON.stringify(value)).not.toContain(a.owner);
});

it("revokes other sessions on a recovery-verified password reset and rejects the old password", async () => {
  const a = await createAccount();
  const second = await send("/api/auth/sign-in/gamertag", { username: a.username, proof: a.proof });
  expect(second.status).toBe(200);
  const changed = "Synthetic changed meadow 73!", proof = await passwordProof(a.username, changed);
  const reset = await send("/api/auth/gamertag-password", { username: a.username, proof, recoveryProof: a.credentials.password, envelope: await wrapPasswordRoot(a.root, a.username, changed, a.owner) }, a.session, a.owner, a.browser);
  expect(reset.status).toBe(200);
  expect(await (await send("/api/auth/get-session", undefined, cookie(second))).json()).toBeNull();
  expect((await send("/api/auth/sign-in/gamertag", { username: a.username, proof: a.proof })).status).toBe(401);
  expect((await send("/api/auth/sign-in/gamertag", { username: a.username, proof })).status).toBe(200);
});

it("expires a stored session without extending its access or exposing the encrypted vault", async () => {
  const a = await createAccount();
  await pool.query('UPDATE "session" SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1', [a.owner]);
  expect(await (await send("/api/auth/get-session", undefined, a.session)).json()).toBeNull();
  expect((await send("/api/cloud", undefined, a.session, a.owner)).status).toBe(401);
});
