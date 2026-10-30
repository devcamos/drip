import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ReminderStore } from "../server/notifications/store";
import { reminderApi } from "../server/notifications/api";
import { pushFixture } from "../tests/notification-fixtures";

const url = new URL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/drip_notifications_test") throw new Error("Rate-limit tests require the isolated loopback test database.");
const schema = `push_limits_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}` });
const fixture = pushFixture(), store = new ReminderStore(pool, fixture.config.storageKey), now = new Date("2026-10-29T09:00:00Z");
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
async function owner() {
  const id = randomUUID(); await pool.query('INSERT INTO "user" VALUES ($1)', [id]); return id;
}
async function budget(id: string, action: "update" | "test") {
  return (await pool.query("SELECT hits,window_started_at FROM drip_push_rate_limits WHERE user_id=$1 AND action=$2", [id, action])).rows[0];
}
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query('CREATE TABLE "user" (id text PRIMARY KEY)');
  await pool.query(readFileSync(new URL("../scripts/payment-notifications.sql", import.meta.url), "utf8"));
});
afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });

it("preserves update limits after deletion and caller-chosen device/endpoint rotation until the rolling minute ends", async () => {
  const id = await owner(), f = pushFixture();
  await store.save(id, f.device, f.subscription, f.schedule, now);
  await pool.query("UPDATE drip_push_rate_limits SET hits=60 WHERE user_id=$1 AND action='update'", [id]);
  await store.remove(id, f.device);
  await expect(store.save(id, f.device, f.subscription, f.schedule, now)).rejects.toMatchObject({ status: 429 });
  const rotated = pushFixture();
  await expect(store.save(id, rotated.device, rotated.subscription, rotated.schedule, later(59))).rejects.toMatchObject({ status: 429 });
  expect((await budget(id, "update")).hits).toBe(60);
  await store.save(id, rotated.device, rotated.subscription, rotated.schedule, later(60));
  expect((await budget(id, "update")).hits).toBe(1);
});

it("keeps test cooldown across enrollment removal, provider expiry and endpoint ownership transfer", async () => {
  const id = await owner(), other = await owner(), f = pushFixture();
  await store.save(id, f.device, f.subscription, f.schedule, now);
  const original = (await store.current(id, f.device))!;
  expect(await store.allowTest(original, now)).toBe(true);
  // A transport may move only with its existing proof. Its previous owner's
  // action budget remains in place even after the old enrollment disappears.
  await store.save(other, f.device, f.subscription, f.schedule, now);
  expect(await store.current(id, f.device)).toBeUndefined();
  const rotated = pushFixture(); await store.save(id, rotated.device, rotated.subscription, rotated.schedule, now);
  const row = (await store.current(id, rotated.device))!;
  expect(await store.allowTest(row, now)).toBe(false);
  await store.expired(row);
  await store.save(id, rotated.device, rotated.subscription, rotated.schedule, now);
  const replacement = (await store.current(id, rotated.device))!;
  expect(await store.allowTest(replacement, later(59))).toBe(false);
  expect(await store.allowTest(replacement, later(60))).toBe(true);
  const otherRow = (await store.current(other, f.device))!;
  expect(await store.allowTest(otherRow, now)).toBe(true); // Independent owner.
});

it("atomically admits only one simultaneous owner test and one remaining update", async () => {
  const id = await owner(), f = pushFixture(); await store.save(id, f.device, f.subscription, f.schedule, now);
  const row = (await store.current(id, f.device))!;
  const tests = await Promise.all(Array.from({ length: 12 }, () => store.allowTest(row, now)));
  expect(tests.filter(Boolean)).toHaveLength(1);
  await pool.query("UPDATE drip_push_rate_limits SET hits=59 WHERE user_id=$1 AND action='update'", [id]);
  const writes = await Promise.allSettled(Array.from({ length: 10 }, () => store.save(id, f.device, f.subscription, f.schedule, now)));
  expect(writes.filter(item => item.status === "fulfilled")).toHaveLength(1);
  const rejected = writes.filter(item => item.status === "rejected");
  expect(rejected).toHaveLength(9); for (const item of rejected) expect(item.reason).toMatchObject({ status: 429 });
  expect((await budget(id, "update")).hits).toBe(60);
});

it("consumes update budget even when a registration transaction rolls back", async () => {
  const id = await owner(), occupiedOwner = await owner(), f = pushFixture();
  await store.save(occupiedOwner, f.device, f.subscription, f.schedule, now);
  const wrongProof = { ...f.subscription, keys: pushFixture().subscription.keys };
  await expect(store.save(id, randomUUID(), wrongProof, f.schedule, now)).rejects.toMatchObject({ status: 409 });
  expect((await budget(id, "update")).hits).toBe(1);
  await pool.query("UPDATE drip_push_rate_limits SET hits=59 WHERE user_id=$1 AND action='update'", [id]);
  await expect(store.save(id, randomUUID(), wrongProof, f.schedule, now)).rejects.toMatchObject({ status: 409 });
  const clean = pushFixture();
  await expect(store.save(id, clean.device, clean.subscription, clean.schedule, now)).rejects.toMatchObject({ status: 429 });
  expect(await store.current(occupiedOwner, f.device)).toBeDefined();
  await expect(store.save("missing-owner", clean.device, clean.subscription, clean.schedule, now)).rejects.toMatchObject({ code: "23503" });
  expect(await budget("missing-owner", "update")).toBeUndefined();
});

it("bounds limiter state to two rows per owner and removes it only with the owner", async () => {
  const id = await owner(), f = pushFixture(); await store.save(id, f.device, f.subscription, f.schedule, now);
  expect(await store.allowTest((await store.current(id, f.device))!, now)).toBe(true);
  const second = pushFixture(); await store.save(id, second.device, second.subscription, second.schedule, now);
  await store.remove(id, f.device); await store.remove(id, second.device);
  expect((await pool.query("SELECT action FROM drip_push_rate_limits WHERE user_id=$1", [id])).rows).toHaveLength(2);
  await expect(pool.query("INSERT INTO drip_push_rate_limits VALUES($1,'unknown',$2,1)", [id, now])).rejects.toMatchObject({ code: "23514" });
  await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  expect((await pool.query("SELECT action FROM drip_push_rate_limits WHERE user_id=$1", [id])).rows).toHaveLength(0);
});

it("does not admit stale or deleted enrollment rows even when the owner budget is available", async () => {
  const id = await owner(), f = pushFixture(); await store.save(id, f.device, f.subscription, f.schedule, now);
  const stale = (await store.current(id, f.device))!;
  await store.save(id, f.device, f.subscription, f.schedule, now);
  expect(await store.allowTest(stale, now)).toBe(false);
  const current = (await store.current(id, f.device))!;
  expect(await store.allowTest(current, later(60))).toBe(true);
  await store.remove(id, f.device);
  expect(await store.allowTest(current, later(120))).toBe(false);
});

it("blocks an API test after delete/re-enroll before contacting the push provider", async () => {
  const id = await owner(), f = pushFixture(), sender = vi.fn().mockResolvedValue(undefined);
  let clock = now;
  const api = reminderApi({ config: () => f.config, origin: () => "https://drip.example", session: async () => ({ user: { id } }), store: () => store, sender: () => sender, now: () => clock });
  const request = (method: string, body?: unknown) => new Request("https://drip.example/api/notifications/subscription", { method, headers: { origin: "https://drip.example", "x-drip-owner": id, "x-drip-device": f.device, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const registration = { subscription: f.subscription, schedule: f.schedule };
  expect((await api.PUT(request("PUT", registration))).status).toBe(200);
  expect((await api.test(request("POST"))).status).toBe(200);
  expect((await api.DELETE(request("DELETE"))).status).toBe(200);
  expect((await api.PUT(request("PUT", registration))).status).toBe(200);
  expect((await api.test(request("POST"))).status).toBe(429); expect(sender).toHaveBeenCalledOnce();
  clock = later(59); expect((await api.test(request("POST"))).status).toBe(429);
  clock = later(60); expect((await api.test(request("POST"))).status).toBe(200); expect(sender).toHaveBeenCalledTimes(2);
});
