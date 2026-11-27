import { safeFetch } from "./worker-safety";
import { handleError, type Identity } from "./identity";

type Reservation = { identityId: string; handle: string; suffix?: string; changed: boolean; error?: string };
export type ReservationContext = { userId: string; resumeGeneration?: string; signupNonce?: string };
export async function reserveIdentity(identity: Identity, context: ReservationContext, mode: "ensure" | "rename" | "signup" = "ensure"): Promise<Identity> {
  const response = await safeFetch("/api/identity/handle", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Drip-Owner": context.userId, ...(context.resumeGeneration ? { "X-Drip-Resume": context.resumeGeneration } : {}), ...(context.signupNonce ? { "X-Drip-Signup": context.signupNonce } : {}) }, body: JSON.stringify({ identityId: identity.id, expectedUserId: context.userId, handle: identity.handle, mode }) });
  let result: Reservation;
  try { result = await response.json() as Reservation; }
  catch { throw new Error("Gamertag service is unavailable. Your local account is safe; try again shortly."); }
  if (!response.ok) throw new Error(result.error ?? "Could not reserve your gamertag. Try again shortly.");
  if (result.identityId !== identity.id || !result.handle || handleError(result.handle) || (result.suffix !== undefined && !/^\d{1,4}$/.test(result.suffix))) throw new Error("Could not confirm your profile gamertag. Try again shortly.");
  return { ...identity, handle: result.handle, ...(result.suffix ? { suffix: result.suffix } : { suffix: undefined }) };
}
