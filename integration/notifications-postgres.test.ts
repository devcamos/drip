import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ReminderStore } from "../server/notifications/store";
import { dispatchReminders } from "../server/notifications/dispatch";
import { pushFixture } from "../tests/notification-fixtures";

// Fail closed: this suite may mutate only its own schema in an ephemeral local DB.
const url = new URL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/drip_notifications_test") throw new Error("Integration tests require the isolated loopback test database.");
const schema = `reminders_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}` });
const fixture = pushFixture(), store = new ReminderStore(pool, fixture.config.storageKey), now = new Date("2026-10-29T09:00:00Z");
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query('CREATE TABLE "user" (id text PRIMARY KEY)');
  await pool.query('INSERT INTO "user"(id) VALUES ($1),($2)', ["owner", "other"]);
  await pool.query(readFileSync(new URL("../scripts/payment-notifications.sql", import.meta.url), "utf8"));
});
afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
it("applies the migration idempotently and encrypts transport data with owner/device isolation", async () => {
  await pool.query(readFileSync(new URL("../scripts/payment-notifications.sql", import.meta.url), "utf8"));
  await store.save("owner", fixture.device, fixture.subscription, fixture.schedule, now);
  const row = (await store.current("owner", fixture.device))!;
  expect(store.subscription(row)).toEqual(fixture.subscription);
  expect(JSON.stringify(row.envelope)).not.toContain(fixture.subscription.endpoint);
  expect(await store.current("other", fixture.device)).toBeUndefined();
  await store.remove("other", fixture.device); expect(await store.current("owner", fixture.device)).toBeDefined();
  await expect(store.save("missing-user", randomUUID(), pushFixture().subscription, fixture.schedule, now)).rejects.toThrow();
});
it("requires transport-secret proof before moving an endpoint between owners", async () => {
  const device = randomUUID();
  await expect(store.save("other", device, { ...fixture.subscription, keys: pushFixture().subscription.keys }, fixture.schedule, now)).rejects.toMatchObject({ status: 409 });
  await store.save("other", device, fixture.subscription, fixture.schedule, now);
  expect(await store.current("owner", fixture.device)).toBeUndefined(); expect(await store.current("other", device)).toBeDefined();
  await store.remove("other", device);
});
it("enforces update/test rate limits and releases transactions after a rejected write", async () => {
  const f = pushFixture(); await store.save("owner", f.device, f.subscription, f.schedule, now);
  await pool.query('UPDATE drip_push_subscriptions SET rate_hits=60 WHERE device_id=$1', [f.device]);
  await expect(store.save("owner", f.device, f.subscription, f.schedule, now)).rejects.toMatchObject({ status: 429 });
  await store.save("owner", f.device, f.subscription, f.schedule, new Date(now.getTime() + 60000));
  const row = (await store.current("owner", f.device))!;
  expect(await store.allowTest(row, now)).toBe(true); expect(await store.allowTest(row, now)).toBe(false);
  expect(await store.allowTest(row, new Date(now.getTime() + 61000))).toBe(true);
  await store.remove("owner", f.device);
});
it("leases exactly once across overlapping dispatches and preserves newer schedules against stale results", async () => {
  const f = pushFixture(); await store.save("owner", f.device, f.subscription, f.schedule, now);
  let sends = 0; const send = async () => { sends++; };
  await Promise.all([dispatchReminders(store, send, now), dispatchReminders(store, send, now)]);
  expect(sends).toBe(1); await dispatchReminders(store, send, now); expect(sends).toBe(1);
  const row = (await store.current("owner", f.device))!;
  await store.save("owner", f.device, f.subscription, { ...f.schedule, plans: [{ anchor: "2026-12-01", frequency: "annually" }] }, now);
  await store.expired(row); expect(await store.current("owner", f.device)).toBeDefined();
  const day = (await pool.query('SELECT next_due_day::text AS day FROM drip_push_subscriptions WHERE device_id=$1', [f.device])).rows[0].day;
  await store.advance(row, "2026-10-29", null, false);
  expect((await pool.query('SELECT next_due_day::text AS day FROM drip_push_subscriptions WHERE device_id=$1', [f.device])).rows[0].day).toBe(day);
  await store.remove("owner", f.device);
});
it("cleans expired endpoints, retries transient failures, and cascades deleted owners", async () => {
  const f = pushFixture(); await store.save("other", f.device, f.subscription, f.schedule, now);
  const failure = await dispatchReminders(store, async () => { throw { statusCode: 503 }; }, now); expect(failure.failed).toBe(1);
  const gone = await dispatchReminders(store, async () => { throw { statusCode: 410 }; }, now); expect(gone.expired).toBe(1);
  expect(await store.current("other", f.device)).toBeUndefined();
  await store.save("other", f.device, f.subscription, f.schedule, now);
  await pool.query('DELETE FROM "user" WHERE id=$1', ["other"]); expect(await store.current("other", f.device)).toBeUndefined();
});
