"use client";
import { useEffect, useRef, useState } from "react";

export function applyWorkerUpdate(worker: ServiceWorker, listenForChange: () => void, reload: () => void) {
  // Another tab may already have activated this update. No new controllerchange
  // will arrive in that case; the explicit button should still reload this tab.
  if (worker.state === "activated") { reload(); return; }
  listenForChange(); worker.postMessage({ type: "SKIP_WAITING" });
}

export function PwaStatus({ allowReload = true }: Readonly<{ allowReload?: boolean }> = {}) {
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadAllowed = useRef(allowReload);
  useEffect(() => { reloadAllowed.current = allowReload; }, [allowReload]);
  useEffect(() => {
    let active = true; let reloading = false;
    const changed = () => { if (active && reloadAllowed.current && !reloading) { reloading = true; location.reload(); } };
    let registration: ServiceWorkerRegistration | undefined;
    let checking = false; let queued = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (!active || !registration || !navigator.onLine) return;
      if (checking) { queued = true; return; }
      checking = true;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true; clearTimeout(deadline); deadline = undefined; checking = false;
        if (active && queued) { queued = false; check(); }
      };
      // Some browsers leave update() pending. Keep foreground checks from being
      // lost forever; a late completion cannot finish a newer check twice.
      deadline = setTimeout(finish, 5_000);
      void registration.update().catch(() => {}).finally(finish);
    };
    const online = () => { setOffline(!navigator.onLine); if (navigator.onLine) check(); };
    const visible = () => { if (document.visibilityState === "visible") check(); };
    online(); window.addEventListener("online", online); window.addEventListener("offline", online);
    window.addEventListener("pageshow", check); window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    const interval = setInterval(visible, 5 * 60_000);
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
        found(); // Registration can already be installing when its promise resolves.
        check();
      }).catch(() => {});
    }
    const accept = () => navigator.serviceWorker.addEventListener("controllerchange", changed, { once: true });
    window.addEventListener("drip-accept-update", accept);
    return () => {
      active = false; clearInterval(interval); clearTimeout(deadline);
      window.removeEventListener("online", online); window.removeEventListener("offline", online);
      window.removeEventListener("pageshow", check); window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("drip-accept-update", accept); registration?.removeEventListener("updatefound", found); navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, []);
  return <>
    {offline && <output className="banner warn">Offline — Drip is using this device&apos;s saved accounts. Cloud recovery resumes online.</output>}
    {waiting && <div className="banner info"><span>{allowReload ? "Drip update ready. Finish editing before reloading." : "Drip update ready. Finish your edit and return to Accounts before reloading."}</span><button className="btn small" disabled={!allowReload} onClick={() => { if (allowReload) applyWorkerUpdate(waiting, () => { window.dispatchEvent(new Event("drip-accept-update")); }, () => location.reload()); }}>Reload update</button></div>}
  </>;
}
