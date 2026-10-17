"use client";
import { useEffect, useState } from "react";

export function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    let active = true; let reloading = false;
    const online = () => setOffline(!navigator.onLine);
    online(); window.addEventListener("online", online); window.addEventListener("offline", online);
    const changed = () => { if (!reloading) { reloading = true; location.reload(); } };
    let registration: ServiceWorkerRegistration | undefined;
    const found = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => { if (active && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(registration?.waiting ?? null); });
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(r => {
        if (!active) return;
        registration = r;
        if (active && r.waiting) setWaiting(r.waiting);
        r.addEventListener("updatefound", found);
      }).catch(() => {});
    }
    const accept = () => navigator.serviceWorker.addEventListener("controllerchange", changed, { once: true });
    window.addEventListener("drip-accept-update", accept);
    return () => { active = false; window.removeEventListener("online", online); window.removeEventListener("offline", online); window.removeEventListener("drip-accept-update", accept); registration?.removeEventListener("updatefound", found); navigator.serviceWorker?.removeEventListener("controllerchange", changed); };
  }, []);
  return <>
    {offline && <p className="banner warn" role="status">Offline — Drip is using this device&apos;s saved accounts. Cloud recovery resumes online.</p>}
    {waiting && <div className="banner info"><span>Drip update ready. Finish editing before reloading.</span><button className="btn small" onClick={() => { window.dispatchEvent(new Event("drip-accept-update")); waiting.postMessage({ type: "SKIP_WAITING" }); }}>Reload update</button></div>}
  </>;
}
