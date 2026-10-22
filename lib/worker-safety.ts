import { browserDeviceId, getItem } from "./db";
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
  let address: string;
  if (typeof input === "string") address = input;
  else if (input instanceof URL) address = input.href;
  else address = input.url;
  // Parsing base only: fetch still receives the caller's original input.
  const url = new URL(address, "https://drip.invalid");
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const privateRequest = url.pathname.startsWith("/api/auth/") || url.pathname === "/api/cloud" || (url.pathname === "/api/recovery-codes" && method === "PUT");
  if (!privateRequest) return fetch(input, init);
  const run = async () => {
    const deviceId = await browserDeviceId();
    const gate = await getItem<{ signedOut: boolean; generation: string; signupNonce?: string }>("deviceSession");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const resumeGeneration = headers.get("X-Drip-Resume");
    const reconnectGeneration = headers.get("X-Drip-Reconnect");
    const signoutGeneration = headers.get("X-Drip-Signout");
    const disconnectGeneration = headers.get("X-Drip-Disconnect");
    const signupNonce = headers.get("X-Drip-Signup");
    const signup = !!signupNonce && gate?.signedOut && gate.signupNonce === signupNonce && resumeGeneration === gate.generation &&
      ((method === "POST" && ["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/gamertag-password"].includes(url.pathname)) || (url.pathname === "/api/cloud" && ["GET", "PUT"].includes(method)));
    if (signupNonce && !signup) throw new Error("Signup changed in another tab. Your current local account is kept.");
    if (resumeGeneration && (!gate?.signedOut || gate.generation !== resumeGeneration)) throw new Error("Device session changed. Try signing in again.");
    if (reconnectGeneration && (gate?.signedOut || gate?.generation !== reconnectGeneration)) throw new Error("Device session changed. Try signing in again.");
    // An old tab must not revoke a session that another tab has already resumed.
    if (url.pathname === "/api/auth/sign-out" && (
      (signoutGeneration && (!gate?.signedOut || gate.generation !== signoutGeneration)) ||
      (disconnectGeneration && (gate?.signedOut || (gate?.generation ?? "initial") !== disconnectGeneration))
    )) return Response.json({ success: true, stale: true });
    const resuming = (["/api/auth/sign-in/email", "/api/auth/sign-in/gamertag", "/api/auth/sign-in/gamertag-key", "/api/auth/get-session"].includes(url.pathname) || (url.pathname === "/api/cloud" && method === "GET")) && resumeGeneration === gate?.generation;
    if (gate?.signedOut && url.pathname !== "/api/auth/sign-out" && !resuming && !signup) throw new Error("Drip is signed out on this device.");
    headers.set("X-Drip-Device", deviceId);
    return fetch(input, { ...init, headers });
  };
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("drip-private-session", run);
  const request = privateQueue.then(run, run);
  privateQueue = request.catch(() => {});
  return request;
};
