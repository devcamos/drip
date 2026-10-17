import { getItem } from "./db";
let verified: ServiceWorker | null = null;
/** Old Drip workers cached every GET, including APIs. Do not use cloud auth under one. */
export async function requireSafeWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller || controller === verified) return;
  const safe = await new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const finish = (ok: boolean) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ok); };
    const timer = setTimeout(() => finish(false), 1000);
    channel.port1.onmessage = event => finish(event.data?.version >= 3);
    controller.postMessage({ type: "DRIP_WORKER_VERSION" }, [channel.port2]);
  });
  if (!safe) throw new Error("An app update is required for cloud recovery. Finish editing and use Reload update first.");
  verified = controller;
}
let privateQueue: Promise<unknown> = Promise.resolve();
/** Serialize private requests with sign-out, including across tabs on supporting browsers. */
export const safeFetch: typeof fetch = async (input, init) => {
  await requireSafeWorker();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://drip.local");
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const privateRequest = url.pathname.startsWith("/api/auth/") || url.pathname === "/api/cloud" || (url.pathname === "/api/recovery-codes" && method === "PUT");
  if (!privateRequest) return fetch(input, init);
  const run = async () => {
    const gate = await getItem<{ signedOut: boolean; generation: string }>("deviceSession");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const resumeGeneration = headers.get("X-Drip-Resume");
    const signoutGeneration = headers.get("X-Drip-Signout");
    const disconnectGeneration = headers.get("X-Drip-Disconnect");
    if (resumeGeneration && (!gate?.signedOut || gate.generation !== resumeGeneration)) throw new Error("Device session changed. Try signing in again.");
    // An old tab must not revoke a session that another tab has already resumed.
    if (url.pathname === "/api/auth/sign-out" && (
      (signoutGeneration && (!gate?.signedOut || gate.generation !== signoutGeneration)) ||
      (disconnectGeneration && (gate?.signedOut || (gate?.generation ?? "initial") !== disconnectGeneration))
    )) return Response.json({ success: true, stale: true });
    const resuming = (url.pathname === "/api/auth/sign-in/email" || (url.pathname === "/api/cloud" && method === "GET")) && resumeGeneration === gate?.generation;
    if (gate?.signedOut && url.pathname !== "/api/auth/sign-out" && !resuming) throw new Error("Drip is signed out on this device.");
    return fetch(input, init);
  };
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("drip-private-session", run);
  const request = privateQueue.then(run, run);
  privateQueue = request.catch(() => {});
  return request;
};
