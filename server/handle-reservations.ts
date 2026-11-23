import type { Pool, PoolClient } from "@neondatabase/serverless";
import { randomInt } from "node:crypto";
import { isReservedHandle } from "../lib/identity";

export { isReservedHandle };
const SUFFIX_ATTEMPTS = 32;
export type HandleReservation = { identityId: string; handle: string; suffix?: string; changed: boolean };
export class HandleReservationError extends Error {
  constructor(readonly code: "IDENTITY_OWNED" | "ACCOUNT_ALREADY_HAS_IDENTITY" | "HANDLE_UNAVAILABLE") { super(code); }
}
type ReservationRow = { identity_id: string; user_id: string; handle: string; suffix: string | null; active: boolean };
const publicRow = (row: ReservationRow, changed: boolean): HandleReservation => ({
  identityId: row.identity_id, handle: row.handle, ...(row.suffix ? { suffix: row.suffix } : {}), changed,
});
const suffix = () => String(randomInt(0, 10_000)).padStart(4, "0");

async function allocate(client: PoolClient, identityId: string, userId: string, handle: string, value?: string) {
  const { rows } = await client.query<ReservationRow>(`INSERT INTO drip_handle_reservations (identity_id, user_id, handle, suffix)
    VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING identity_id, user_id, handle, suffix, active`, [identityId, userId, handle, value ?? null]);
  return rows[0];
}

/** Atomically assign the profile handle to the authenticated account. Old names
 * remain unavailable for 30 days after a rename, then are lazily reclaimed. */
export async function reserveHandle(db: Pool, identityId: string, userId: string, handle: string, allowRename = false): Promise<HandleReservation> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`drip-handle:${userId}`]);
    await client.query("DELETE FROM drip_handle_reservations WHERE NOT active AND cooling_until <= now()");
    const current = await client.query<ReservationRow>(`SELECT identity_id, user_id, handle, suffix, active
      FROM drip_handle_reservations WHERE active AND (identity_id = $1 OR user_id = $2) FOR UPDATE`, [identityId, userId]);
    const activeForIdentity = current.rows.find(row => row.identity_id === identityId);
    const activeForUser = current.rows.find(row => row.user_id === userId);
    if (activeForIdentity && activeForIdentity.user_id !== userId) throw new HandleReservationError("IDENTITY_OWNED");
    if (activeForUser && activeForUser.identity_id !== identityId) throw new HandleReservationError("ACCOUNT_ALREADY_HAS_IDENTITY");
    if (activeForIdentity && activeForIdentity.handle.toLowerCase() === handle.toLowerCase()) {
      await client.query("COMMIT");
      return publicRow(activeForIdentity, false);
    }
    if (activeForIdentity && !allowRename) {
      await client.query("COMMIT");
      return publicRow(activeForIdentity, false);
    }

    if (activeForIdentity) {
      await client.query(`UPDATE drip_handle_reservations SET active = false, cooling_until = now() + interval '30 days'
        WHERE reservation_id = (SELECT reservation_id FROM drip_handle_reservations WHERE active AND identity_id = $1)`, [identityId]);
    }

    // A returning owner may reclaim their prior name during the cooling window.
    const prior = await client.query<ReservationRow>(`UPDATE drip_handle_reservations SET active = true, cooling_until = NULL, handle = $3
      WHERE reservation_id = (SELECT reservation_id FROM drip_handle_reservations WHERE NOT active AND user_id = $1 AND identity_id = $2
        AND handle_key = lower($3) AND cooling_until > now() ORDER BY created_at DESC LIMIT 1)
      RETURNING identity_id, user_id, handle, suffix, active`, [userId, identityId, handle]);
    if (prior.rows[0]) {
      await client.query("COMMIT");
      return publicRow(prior.rows[0], true);
    }

    let created = await allocate(client, identityId, userId, handle);
    if (!created) {
      for (let attempt = 0; attempt < SUFFIX_ATTEMPTS && !created; attempt++) created = await allocate(client, identityId, userId, handle, suffix());
    }
    if (!created) {
      const owner = await client.query<ReservationRow>("SELECT identity_id, user_id, handle, suffix, active FROM drip_handle_reservations WHERE active AND (identity_id=$1 OR user_id=$2)", [identityId, userId]);
      if (owner.rows.some(row => row.identity_id === identityId && row.user_id !== userId)) throw new HandleReservationError("IDENTITY_OWNED");
      if (owner.rows.some(row => row.user_id === userId && row.identity_id !== identityId)) throw new HandleReservationError("ACCOUNT_ALREADY_HAS_IDENTITY");
      throw new HandleReservationError("HANDLE_UNAVAILABLE");
    }
    await client.query("COMMIT");
    return publicRow(created, true);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Unique races against another identity are handled by suffix allocation;
    // these are the partial owner indexes, which mean ownership must not move.
    if ((error as { code?: string }).code === "23505") throw new HandleReservationError("IDENTITY_OWNED");
    throw error;
  } finally { client.release(); }
}
