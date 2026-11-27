import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { regressionDatabaseURL } from "../server/local-test-database";
import { migrationStatements } from "../tools/regression/policy.mjs";
import { reserveHandle } from "../server/handle-reservations";
import type { Pool as NeonPool } from "@neondatabase/serverless";

const url = regressionDatabaseURL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
const schema = "handle_reservation_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 8 });
const reserve = (identityId: string, userId: string, handle: string, rename = false, sessionId?: string) => reserveHandle(pool as unknown as NeonPool, identityId, userId, handle, rename, sessionId);
async function owner() {
  const userId = randomUUID(), identityId = randomUUID();
  await pool.query('INSERT INTO "user" (id) VALUES ($1)', [userId]);
  return { userId, identityId };
}
async function passkeySession(userId: string, fresh = true) {
  const id = randomUUID();
  await pool.query('INSERT INTO "session" (id, "userId", "expiresAt", "dripPasskeyVerifiedAt") VALUES ($1, $2, now() + interval \'1 day\', $3)', [id, userId, fresh ? new Date() : new Date(Date.now() - 6 * 60_000)]);
  return id;
}

beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query('CREATE TABLE "user" (id text PRIMARY KEY)');
  // The production migration also adds the device field to Better Auth's
  // session table. This focused fixture only needs its existing primary key.
  await pool.query('CREATE TABLE "session" (id text PRIMARY KEY, "userId" text REFERENCES "user"(id) ON DELETE CASCADE, "expiresAt" timestamptz, "dripPasskeyVerifiedAt" timestamptz)');
  for (const sql of migrationStatements(readFileSync(new URL("../scripts/migrate.mjs", import.meta.url), "utf8"))) await pool.query(sql);
}, 30_000);
beforeEach(async () => { await pool.query('TRUNCATE "user" CASCADE'); });
afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });

it("allocates distinct case-insensitive tags under concurrent claims and returns a stable result on retry", async () => {
  const owners = await Promise.all(Array.from({ length: 8 }, () => owner()));
  const assigned = await Promise.all(owners.map((item, index) => reserve(item.identityId, item.userId, index ? "SharedName" : "sharedname")));
  expect(new Set(assigned.map(item => `${item.handle.toLowerCase()}#${item.suffix ?? ""}`)).size).toBe(owners.length);
  expect(assigned.filter(item => !item.suffix)).toHaveLength(1);
  expect(assigned.filter(item => item.suffix)).toHaveLength(owners.length - 1);
});

it("returns the same reserved identity on retries and never renames an ensure request", async () => {
  const item = await owner(), original = await reserve(item.identityId, item.userId, "Original");
  expect(await reserve(item.identityId, item.userId, "ORIGINAL")).toMatchObject({ ...original, changed: false });
  expect(await reserve(item.identityId, item.userId, "Different", false)).toMatchObject({ ...original, changed: false });
});

it("keeps renamed handles for 30 days, lets their owner reclaim them, then frees expired handles", async () => {
  const original = await owner(), competitor = await owner();
  await reserve(original.identityId, original.userId, "Riverbank");
  let proof = await passkeySession(original.userId);
  await reserve(original.identityId, original.userId, "NewRiver", true, proof);
  const held = await reserve(competitor.identityId, competitor.userId, "riverbank");
  expect(held.suffix).toMatch(/^\d{4}$/);
  proof = await passkeySession(original.userId);
  const reclaim = await reserve(original.identityId, original.userId, "Riverbank", true, proof);
  expect(reclaim.suffix).toBeUndefined();
  proof = await passkeySession(original.userId);
  await reserve(original.identityId, original.userId, "FinalRiver", true, proof);
  await pool.query("UPDATE drip_handle_reservations SET cooling_until=now()-interval '1 second' WHERE identity_id=$1 AND NOT active AND handle_key='riverbank'", [original.identityId]);
  const latecomer = await owner(), released = await reserve(latecomer.identityId, latecomer.userId, "Riverbank");
  expect(released).toMatchObject({ handle: "Riverbank" }); expect(released.suffix).toBeUndefined();
});

it("requires and consumes a fresh account passkey proof for an actual rename", async () => {
  const item = await owner(); await reserve(item.identityId, item.userId, "Original");
  await expect(reserve(item.identityId, item.userId, "WithoutProof", true)).rejects.toMatchObject({ code: "PASSKEY_REQUIRED" });
  const expired = await passkeySession(item.userId, false);
  await expect(reserve(item.identityId, item.userId, "ExpiredProof", true, expired)).rejects.toMatchObject({ code: "PASSKEY_REQUIRED" });
  const fresh = await passkeySession(item.userId);
  await expect(reserve(item.identityId, item.userId, "Renamed", true, fresh)).resolves.toMatchObject({ handle: "Renamed", changed: true });
  await expect(reserve(item.identityId, item.userId, "ThirdName", true, fresh)).rejects.toMatchObject({ code: "PASSKEY_REQUIRED" });
  await expect(reserve(item.identityId, item.userId, "Renamed", true, fresh)).resolves.toMatchObject({ handle: "Renamed", changed: false });
});

it("binds one stable identity per user and never renames during an ensure", async () => {
  const first = await owner(), second = await owner();
  const original = await reserve(first.identityId, first.userId, "Original");
  expect(await reserve(first.identityId, first.userId, "Different", false)).toMatchObject({ ...original, changed: false });
  await expect(reserve(first.identityId, second.userId, "Taken")).rejects.toMatchObject({ code: "IDENTITY_OWNED" });
  await expect(reserve(randomUUID(), first.userId, "Another")).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_HAS_IDENTITY" });
});
