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
export const safeFetch: typeof fetch = async (input, init) => { await requireSafeWorker(); return fetch(input, init); };
