import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { regressionDatabaseURL } from "../server/local-test-database";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { saveFeedback } from "../server/feedback/store";
import { feedbackApi } from "../server/feedback/api";

const url = regressionDatabaseURL(process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test");
const schema = `feedback_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url.href });
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}` });
const message = () => ({ id: randomUUID(), category: "bug" as const, area: "accounts" as const, message: "A card was clipped." });
beforeAll(async () => { await admin.query(`CREATE SCHEMA ${schema}`); await pool.query('CREATE TABLE "user" (id text PRIMARY KEY)'); await pool.query('INSERT INTO "user" (id) VALUES ($1), ($2)', ["owner", "other"]); await pool.query(readFileSync(new URL("../scripts/feedback.sql", import.meta.url), "utf8")); });
afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
it("applies the migration idempotently and stores only the explicitly supplied fields", async () => {
  await pool.query(readFileSync(new URL("../scripts/feedback.sql", import.meta.url), "utf8")); const input = message();
  expect(await saveFeedback(pool, "owner", input)).toBe("saved");
  const row = (await pool.query("SELECT id, user_id, category, area, message, status FROM drip_feedback WHERE id=$1", [input.id])).rows[0];
  expect(row).toEqual({ ...input, user_id: "owner", status: "new" });
});
it("deduplicates concurrent retries and rejects another owner or edited reuse", async () => {
  const input = message(); const results = await Promise.all([saveFeedback(pool, "owner", input), saveFeedback(pool, "owner", input)]);
  expect(results.sort()).toEqual(["retry", "saved"]); expect(await saveFeedback(pool, "other", input)).toBe("conflict");
  expect(await saveFeedback(pool, "owner", { ...input, message: "changed" })).toBe("conflict");
  expect(Number((await pool.query("SELECT count(*) FROM drip_feedback WHERE id=$1", [input.id])).rows[0].count)).toBe(1);
});
it("validates an authenticated API request and persists it through the real database", async () => {
  const input = message();
  const post = feedbackApi({ origin: () => "https://drip.example", session: async () => ({ user: { id: "owner" } }), save: (owner, data) => saveFeedback(pool, owner, data) });
  const response = await post(new Request("https://drip.example/api/feedback", { method: "POST", headers: { origin: "https://drip.example", "content-type": "application/json", "x-drip-owner": "owner" }, body: JSON.stringify(input) }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ saved: true, reference: input.id });
  expect((await pool.query("SELECT message FROM drip_feedback WHERE id=$1", [input.id])).rows[0].message).toBe(input.message);
});
it("enforces the durable per-owner quota without charging a retry and resets after one hour", async () => {
  await pool.query("DELETE FROM drip_feedback_limits WHERE user_id=$1", ["other"]);
  const input = message(); expect(await saveFeedback(pool, "other", input)).toBe("saved");
  for (let i = 0; i < 9; i++) expect(await saveFeedback(pool, "other", message())).toBe("saved");
  expect(await saveFeedback(pool, "other", input)).toBe("retry"); expect(await saveFeedback(pool, "other", message())).toBe("limited");
  await pool.query("UPDATE drip_feedback_limits SET window_started_at=now()-interval '2 hours' WHERE user_id=$1", ["other"]);
  expect(await saveFeedback(pool, "other", message())).toBe("saved");
});
it("deletes feedback and quota metadata when its owner is deleted", async () => {
  await pool.query('DELETE FROM "user" WHERE id=$1', ["other"]);
  expect(Number((await pool.query("SELECT count(*) FROM drip_feedback WHERE user_id=$1", ["other"])).rows[0].count)).toBe(0);
  expect(Number((await pool.query("SELECT count(*) FROM drip_feedback_limits WHERE user_id=$1", ["other"])).rows[0].count)).toBe(0);
});
