import type { Pool } from "pg";
import type { FeedbackInput } from "@/lib/feedback";

/** Serialise per owner: exact retries receive the original receipt without using the quota. */
export async function saveFeedback(pool: Pick<Pool, "connect">, userId: string, input: FeedbackInput): Promise<"saved" | "retry" | "conflict" | "limited"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`drip-feedback:${userId}`]);
    const existing = await client.query("SELECT user_id, category, area, message FROM drip_feedback WHERE id = $1", [input.id]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      await client.query("COMMIT");
      return row.user_id === userId && row.category === input.category && row.area === input.area && row.message === input.message ? "retry" : "conflict";
    }
    const limit = await client.query(`INSERT INTO drip_feedback_limits (user_id, window_started_at, hits) VALUES ($1, now(), 1)
      ON CONFLICT (user_id) DO UPDATE SET
        window_started_at = CASE WHEN drip_feedback_limits.window_started_at <= now() - interval '1 hour' THEN now() ELSE drip_feedback_limits.window_started_at END,
        hits = CASE WHEN drip_feedback_limits.window_started_at <= now() - interval '1 hour' THEN 1 ELSE drip_feedback_limits.hits + 1 END
      WHERE drip_feedback_limits.window_started_at <= now() - interval '1 hour' OR drip_feedback_limits.hits < 10 RETURNING hits`, [userId]);
    if (!limit.rows.length) { await client.query("COMMIT"); return "limited"; }
    await client.query("INSERT INTO drip_feedback (id, user_id, category, area, message) VALUES ($1, $2, $3, $4, $5)", [input.id, userId, input.category, input.area, input.message]);
    await client.query("COMMIT");
    return "saved";
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
