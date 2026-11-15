"use client";
import { useEffect, useRef, useState } from "react";

export function applyWorkerUpdate(worker: ServiceWorker, listenForChange: () => void, reload: () => void) {
  // Another tab may already have activated this update. No new controllerchange
  // will arrive in that case; the explicit button should still reload this tab.
  if (worker.state === "activated") { reload(); return; }
  listenForChange(); worker.postMessage({ type: "SKIP_WAITING" });
}

export function PwaUpdateSettings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const build = process.env.NEXT_PUBLIC_DRIP_BUILD_ID?.split("-")[0]?.slice(0, 7) || "development";
  async function checkForUpdates() {
    if (!("serviceWorker" in navigator)) { setMessage("Updates are not available in this browser."); return; }
    if (!navigator.onLine) { setMessage("Connect to the internet to check for updates."); return; }
    setBusy(true); setMessage("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const check = async () => {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (!registration) throw new Error("No installed worker");
        await registration.update();
      };
      await Promise.race([check(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Timed out")), 10_000); })]);
      setMessage("Update check requested. If an update is ready, return to Accounts to install it.");
    } catch { setMessage("Could not check for updates. Try again when you have a connection."); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  return <section className="panel"><h2>App updates</h2>
    <p className="muted">Build {build}. Drip checks for updates when you open it.</p>
    <button className="btn ghost" disabled={busy} onClick={() => void checkForUpdates()}>{busy ? "Checking…" : "Check for updates"}</button>
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
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
    let checking = false;
    const check = () => {
      if (!active || !registration || !navigator.onLine || checking) return;
      checking = true;
      // Offline/failed checks leave the installed app and its saved data intact.
      void registration.update().catch(() => {}).finally(() => { checking = false; });
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
      active = false; clearInterval(interval);
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
