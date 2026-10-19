import type { Pool, PoolClient } from "@neondatabase/serverless";

/** Serialize password finalization/reset for an owner, including first setup.
 * Work must use this client only: holding a pooled connection while calling the
 * auth adapter could exhaust the same pool. Each statement after the lock gets
 * a fresh READ COMMITTED snapshot, including sessions inserted while waiting.
 */
export async function withPasswordOwner<T>(db: Pool, owner: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect(); let broken = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query('SELECT id FROM "user" WHERE id = $1 FOR NO KEY UPDATE', [owner]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { broken = true; });
    throw error;
  } finally { client.release(broken); }
}
