import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { ReminderSchedule } from "@/lib/payment-reminders";
import { dateInZone, followingDay, nextReminder } from "@/lib/payment-reminders";
import { openSubscription, sealSubscription, type SubscriptionEnvelope } from "./crypto";
import { ReminderError, type PushSubscription } from "./model";

export interface ReminderDatabase {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  connect(): Promise<ReminderConnection>;
}
export interface ReminderConnection extends Pick<ReminderDatabase, "query"> { release(): void }
export type PushRow = { id: string; user_id: string; device_id: string; envelope: SubscriptionEnvelope; schedule: ReminderSchedule; revision: number };

export class ReminderStore {
  constructor(readonly db: ReminderDatabase, private readonly key: Buffer) {}
  async current(owner: string, device: string): Promise<PushRow | undefined> {
    return (await this.db.query("SELECT id,user_id,device_id,envelope,schedule,revision FROM drip_push_subscriptions WHERE user_id=$1 AND device_id=$2", [owner, device])).rows[0];
  }
  async remove(owner: string, device: string) { await this.db.query("DELETE FROM drip_push_subscriptions WHERE user_id=$1 AND device_id=$2", [owner, device]); }
  async expired(row: PushRow) { await this.db.query("DELETE FROM drip_push_subscriptions WHERE id=$1 AND revision=$2", [row.id, row.revision]); }
  async save(owner: string, device: string, subscription: PushSubscription, schedule: ReminderSchedule, now = new Date()) {
    const hash = createHash("sha256").update(subscription.endpoint).digest("hex");
    const connection = await this.db.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`drip-push-endpoint:${hash}`]);
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`drip-push-owner:${owner}`]);
      const current = (await connection.query("SELECT * FROM drip_push_subscriptions WHERE user_id=$1 AND device_id=$2 FOR UPDATE", [owner, device])).rows[0];
      const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      const hits = current && new Date(current.rate_bucket).getTime() === bucket.getTime() ? current.rate_hits + 1 : 1;
      if (hits > 60) throw new ReminderError("Too many reminder updates. Try again in a minute.", 429);
      if (!current && Number((await connection.query("SELECT count(*) AS total FROM drip_push_subscriptions WHERE user_id=$1", [owner])).rows[0].total) >= 20) throw new ReminderError("Too many notification devices. Turn off reminders on another device first.", 409);
      const occupied = (await connection.query("SELECT * FROM drip_push_subscriptions WHERE endpoint_hash=$1 FOR UPDATE", [hash])).rows[0] as PushRow | undefined;
      if (occupied && occupied.id !== current?.id) {
        const original = openSubscription(occupied.envelope, this.key, occupied.user_id, occupied.device_id);
        const matches = (a: string, b: string) => { const left = Buffer.from(a, "base64url"), right = Buffer.from(b, "base64url"); return left.length === right.length && timingSafeEqual(left, right); };
        if (!matches(original.keys.auth, subscription.keys.auth) || !matches(original.keys.p256dh, subscription.keys.p256dh)) throw new ReminderError("This notification address could not be verified.", 409);
        await connection.query("DELETE FROM drip_push_subscriptions WHERE id=$1", [occupied.id]);
      }
      const envelope = sealSubscription(subscription, this.key, owner, device);
      const due = nextReminder(schedule, dateInZone(now, schedule.timeZone));
      await connection.query(`INSERT INTO drip_push_subscriptions(id,user_id,device_id,endpoint_hash,envelope,schedule,next_due_day,rate_bucket,rate_hits,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,device_id) DO UPDATE SET
        endpoint_hash=EXCLUDED.endpoint_hash,envelope=EXCLUDED.envelope,schedule=EXCLUDED.schedule,next_due_day=EXCLUDED.next_due_day,
        rate_bucket=EXCLUDED.rate_bucket,rate_hits=EXCLUDED.rate_hits,updated_at=EXCLUDED.updated_at,revision=drip_push_subscriptions.revision+1`,
      [current?.id ?? randomUUID(), owner, device, hash, JSON.stringify(envelope), JSON.stringify(schedule), due, bucket, hits, now]);
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK").catch(() => {}); throw error; }
    finally { connection.release(); }
  }
  async candidates(after: string | null, now: Date): Promise<PushRow[]> {
    return (await this.db.query(`SELECT id,user_id,device_id,envelope,schedule,revision FROM drip_push_subscriptions
      WHERE ($1::uuid IS NULL OR id>$1) AND next_due_day <= ($2::date+1) ORDER BY id LIMIT 100`, [after, now.toISOString().slice(0, 10)])).rows;
  }
  async claim(row: PushRow, day: string, token: string, now: Date) {
    return !!(await this.db.query(`UPDATE drip_push_subscriptions SET lease_token=$1,lease_until=$2::timestamptz+interval '2 minutes'
      WHERE id=$3 AND revision=$4 AND (last_sent_day IS NULL OR last_sent_day<$5::date) AND next_due_day<=$5::date
      AND (lease_until IS NULL OR lease_until<$2) RETURNING id`, [token, now, row.id, row.revision, day])).rows.length;
  }
  async advance(row: PushRow, day: string, token: string | null, sent: boolean) {
    const due = nextReminder(row.schedule, sent ? followingDay(day) : day);
    if (!token) { await this.db.query("UPDATE drip_push_subscriptions SET next_due_day=$1 WHERE id=$2 AND revision=$3 AND (lease_until IS NULL OR lease_until<now())", [due, row.id, row.revision]); return; }
    await this.db.query(`UPDATE drip_push_subscriptions SET last_sent_day=CASE WHEN $1 THEN $2::date ELSE last_sent_day END,
      next_due_day=CASE WHEN revision=$3 THEN $4::date ELSE next_due_day END,lease_token=NULL,lease_until=NULL
      WHERE id=$5 AND lease_token=$6`, [sent, day, row.revision, due, row.id, token]);
  }
  async failed(row: PushRow, token: string, gone: boolean) {
    if (gone) await this.db.query("DELETE FROM drip_push_subscriptions WHERE id=$1 AND revision=$2 AND lease_token=$3", [row.id, row.revision, token]);
    await this.db.query("UPDATE drip_push_subscriptions SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [row.id, token]);
  }
  subscription(row: PushRow) { return openSubscription(row.envelope, this.key, row.user_id, row.device_id); }
  async allowTest(row: PushRow, now: Date) {
    return !!(await this.db.query("UPDATE drip_push_subscriptions SET last_test_at=$1 WHERE id=$2 AND (last_test_at IS NULL OR last_test_at<$1::timestamptz-interval '1 minute') RETURNING id", [now, row.id])).rows.length;
  }
}
