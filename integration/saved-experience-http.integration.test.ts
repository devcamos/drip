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
import { releaseData, releaseHoldingsAndDebts } from "../tests/saved-experience-fixtures";
import { migrateData } from "../lib/maths";
import { applyMarketValuation } from "../lib/market-valuation";
import { archiveAccount } from "../lib/account-lifecycle";
import { unseal as previousUnseal } from "../tests/fixtures/pre-workflow-client/cloud";
import type { Pool as NeonPool } from "@neondatabase/serverless";

type RouteAuth = { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null> } };
const wired = vi.hoisted(() => ({ db: undefined as unknown as NeonPool, auth: undefined as unknown as RouteAuth }));
// Only the factory connection is injected. Route handlers, Better Auth, queries,
// transactions, limits, hashing and crypto all execute against real Postgres.
vi.mock("../server/auth", async original => ({ ...await original<typeof import("../server/auth")>(), database: () => wired.db, getAuth: () => wired.auth }));
import * as authRoute from "../app/api/auth/[...all]/route";
import * as vaultRoute from "../app/api/cloud/route";
import * as recoveryRoute from "../app/api/recovery-codes/route";

const url = regressionDatabaseURL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55445/drip_notifications_test");
const schema = "saved_http_" + randomUUID().replaceAll("-", "");
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
  const data = releaseData(releaseHoldingsAndDebts());
  data.identity = { id: randomUUID(), handle: username, createdAt: "2026-11-07" };
  data.accounts[1] = applyMarketValuation(data.accounts[1], { priceUSD: 100, fxRate: 0.75, fxDate: "2026-11-06" }, Date.parse("2026-11-07T12:00:00Z"));
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

it("restores every debt and valued holding through real HTTP/auth/Postgres after restart, while rejecting stale cloud replacement", async () => {
  const a = await createAccount();
  expect(a.envelope.v).toBe(3);
  const raw = (await pool.query("SELECT envelope FROM drip_vault WHERE user_id=$1", [a.owner])).rows[0].envelope;
  expect(raw).toEqual(a.envelope); expect(JSON.stringify(raw)).not.toMatch(/Barclaycard|creditCard|marketValuation|averagePriceGBP/);
  expect((await send("/api/auth/sign-out", {}, a.session)).status).toBe(200);
  await startAuth();
  const signed = await send("/api/auth/sign-in/gamertag", { username: a.username, proof: a.proof });
  expect(signed.status).toBe(200);
  const restoredRoot = await unwrapPasswordRoot((await signed.json()).envelope, a.username, password);
  expect(restoredRoot).toBe(a.root);
  const current = await (await send("/api/cloud", undefined, cookie(signed), a.owner)).json();
  expect(current.version).toBe(1); expect(current.envelope.v).toBe(3);
  const restored = await unseal(current.envelope, await deriveCloudEncryptionKey(restoredRoot));
  expect(restored).toEqual(migrateData(a.data, "2026-11-07"));
  expect(restored.accounts.filter(account => account.productCategory === "credit-card")).toHaveLength(2);
  expect(restored.accounts.filter(account => account.rateType === "dividend")).toHaveLength(2);
  expect(restored.accounts[1].marketValuation?.recordedBalance).toBe(2500);
  const edited = { ...a.data, accounts: a.data.accounts.map(account => account.id === "credit" ? { ...account, creditCard: { ...account.creditCard!, plannedPayment: 99 } } : account) };
  const next = await seal(edited, a.key);
  expect((await put("/api/cloud", { version: 1, envelope: next }, cookie(signed), a.owner)).status).toBe(200);
  expect((await put("/api/cloud", { version: 1, envelope: a.envelope }, cookie(signed), a.owner)).status).toBe(409);
  const final = await (await send("/api/cloud", undefined, cookie(signed), a.owner)).json();
  expect(final.version).toBe(2); expect(await unseal(final.envelope, a.key)).toEqual(migrateData(edited, "2026-11-07"));
}, 30000);

it("stores v4 archived income and paid statements over real authenticated HTTP while fencing stale replacement", async () => {
  const a = await createAccount();
  const data = { ...a.data, accounts: a.data.accounts.map(account => account.rateType === "dividend" ? archiveAccount(account, "2026-11-08T12:00:00.000Z") : account.creditCard ? { ...account, creditCard: { ...account.creditCard, statementPaid: true as const } } : account) };
  const envelope = await seal(data, a.key); expect(envelope.v).toBe(4);
  expect((await put("/api/cloud", { version: 1, envelope }, a.session, a.owner)).status).toBe(200);
  await startAuth();
  const current = await (await send("/api/cloud", undefined, a.session, a.owner)).json();
  expect(current.envelope.v).toBe(4);
  const restored = await unseal(current.envelope, a.key);
  expect(restored.accounts[1].archivedAt).toBe("2026-11-08T12:00:00.000Z");
  expect(restored.accounts[3].creditCard?.statementPaid).toBe(true);
  await expect(previousUnseal(current.envelope, a.key)).rejects.toThrow("Unsupported cloud copy");
  expect((await put("/api/cloud", { version: 1, envelope: a.envelope }, a.session, a.owner)).status).toBe(409);
  expect((await pool.query("SELECT envelope FROM drip_vault WHERE user_id=$1", [a.owner])).rows[0].envelope).toEqual(envelope);
}, 30000);
