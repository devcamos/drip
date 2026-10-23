import { AsyncLocalStorage } from "node:async_hooks";
import { APIError } from "better-auth/api";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { withPasswordOwner } from "./password-transaction";
import { reportException, unavailable } from "./http-errors";

export const DEVICE_LIMIT_MESSAGE = "Two devices are already signed in. Sign out on one, then try again.";
const requestAdmission = new AsyncLocalStorage<{ failure?: APIError }>();
type Candidate = { id: string; userId: string };
type HookContext = { path?: string; headers?: Headers; request?: Request } | null;
export type Admission = "admitted" | "limit" | "missing";
const devicePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: APIError): never {
  const state = requestAdmission.getStore();
  if (state) state.failure = error;
  throw error;
}
export function assertDeviceAdmission(result: Admission) {
  if (result === "limit") fail(new APIError("CONFLICT", { code: "DEVICE_LIMIT_REACHED", message: DEVICE_LIMIT_MESSAGE }));
  if (result === "missing") fail(new APIError("UNAUTHORIZED", { code: "SESSION_CHANGED", message: "Sign-in changed. Try signing in again." }));
}

/** Call only while holding this owner's lock, after any credential recheck.
 * Pending candidates count conservatively. A public browser UUID groups renewals;
 * it is not authentication and cannot grant more than two live session rows.
 * Return failures so candidate deletion COMMITs before the endpoint throws.
 */
export async function admitDeviceSession(client: PoolClient, session: Candidate): Promise<Admission> {
  const { rows } = await client.query('SELECT id, "dripDeviceId" FROM "session" WHERE "userId" = $1 AND "expiresAt" > now()', [session.userId]);
  const candidate = rows.find(row => row.id === session.id);
  if (!candidate) {
    await client.query('DELETE FROM "session" WHERE id = $1 AND "userId" = $2', [session.id, session.userId]);
    return "missing";
  }
  const sameDevice = (row: { id: string; dripDeviceId?: string | null }) => candidate.dripDeviceId && row.dripDeviceId === candidate.dripDeviceId;
  const other = rows.filter(row => row.id !== session.id && !sameDevice(row));
  if (other.length >= 2) {
    await client.query('DELETE FROM "session" WHERE id = $1 AND "userId" = $2', [session.id, session.userId]);
    return "limit";
  }
  if (candidate.dripDeviceId) await client.query('DELETE FROM "session" WHERE "userId" = $1 AND "dripDeviceId" = $2 AND id <> $3', [session.userId, candidate.dripDeviceId, session.id]);
  return "admitted";
}

export function deviceSessionHooks(db: Pool) {
  return { session: { create: {
    before: async (_session: Record<string, unknown>, context: HookContext) => {
      const value = (context?.headers ?? context?.request?.headers)?.get("X-Drip-Device");
      if (value !== null && value !== undefined && !devicePattern.test(value)) fail(new APIError("BAD_REQUEST", { code: "INVALID_DEVICE_ID", message: "Invalid browser identifier. Reload Drip and try again." }));
      return { data: { dripDeviceId: value?.toLowerCase() ?? null } };
    },
    after: async (session: Candidate, context: HookContext) => {
      // The password endpoint rechecks its credential under this same owner lock
      // before admitting. A stale candidate must not evict a current session.
      if (context?.path === "/sign-in/gamertag") return;
      let result: Admission;
      try { result = await withPasswordOwner(db, session.userId, client => admitDeviceSession(client, session)); }
      catch (error) {
        reportException(error);
        await db.query('DELETE FROM "session" WHERE id = $1 AND "userId" = $2', [session.id, session.userId]).catch(() => undefined);
        fail(new APIError("SERVICE_UNAVAILABLE", { code: "DEVICE_ADMISSION_UNAVAILABLE", message: "Could not confirm available devices. Try again shortly." }));
      }
      assertDeviceAdmission(result);
    },
  } } };
}

/** Signup may queue a cookie before its after-transaction admission hook runs.
 * Replace the entire response on hook failure, even if the library preserves a
 * queued cookie/token or transforms the thrown error. Nothing private escapes.
 */
export async function guardDeviceAuthResponse(work: () => Promise<Response>): Promise<Response> {
  return requestAdmission.run({}, async () => {
    let response: Response;
    try { response = await work(); }
    catch (error) { reportException(error); response = unavailable("AUTH_UNAVAILABLE", "Could not complete sign-in. Try again shortly."); }
    const failure = requestAdmission.getStore()?.failure;
    if (!failure) return response;
    return Response.json(failure.body, { status: failure.statusCode, headers: { "Cache-Control": "no-store" } });
  });
}
