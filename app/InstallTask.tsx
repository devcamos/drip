"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const preference = "drip-install-task-v1";
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
type Task = { platform: "ios" | "browser"; complete?: boolean };

export function useInstallTask() {
  const [task, setTask] = useState<Task | null>(null);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prompt = useRef<InstallPrompt | null>(null);
  const hidden = useRef(false);
  const finish = useCallback(() => {
    hidden.current = true; prompt.current = null; setAvailable(false);
    try { localStorage.setItem(preference, "complete"); } catch { /* Optional device preference. */ }
    setTask(previous => previous ? { ...previous, complete: true } : null);
  }, []);
  useEffect(() => {
    try { hidden.current = !!localStorage.getItem(preference); } catch { /* Storage may be unavailable. */ }
    const display = window.matchMedia("(display-mode: standalone)");
    const installed = () => display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed()) { finish(); }
    else if (!hidden.current && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))) setTask({ platform: "ios" });
    const offer = (event: Event) => {
      event.preventDefault();
      if (hidden.current || installed()) return;
      prompt.current = event as InstallPrompt; setAvailable(true); setTask({ platform: "browser" });
    };
    const displayChanged = () => { if (installed()) finish(); };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", finish);
    display.addEventListener("change", displayChanged);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", finish);
      display.removeEventListener("change", displayChanged);
    };
  }, [finish]);
  useEffect(() => {
    if (!task?.complete) return;
    const timer = window.setTimeout(() => setTask(null), 1400);
    return () => clearTimeout(timer);
  }, [task?.complete]);
  async function install() {
    const event = prompt.current;
    if (!event) return;
    prompt.current = null; setAvailable(false); setBusy(true); setError("");
    try { await event.prompt(); await event.userChoice; }
    catch { setError("Installation couldn't start. You can still add Drip from your browser's menu."); }
    finally { setBusy(false); }
    // Accepting a prompt is not proof installation finished: wait for appinstalled.
  }
  function dismiss() {
    hidden.current = true; prompt.current = null; setTask(null); setAvailable(false);
    try { localStorage.setItem(preference, "dismissed"); } catch { /* Optional device preference. */ }
  }
  return { task, available, busy, error, install, finish, dismiss };
}

export function InstallTask({ state }: Readonly<{ state: ReturnType<typeof useInstallTask> }>) {
  if (!state.task) return null;
  return <section className={`install-task${state.task.complete ? " is-complete" : ""}`} aria-label="Install Drip task">
    {state.task.complete ? <p role="status">✓ Install task complete</p> : <>
      <div className="install-task-heading"><h2>Install Drip</h2><button className="text-link" onClick={state.dismiss} aria-label="Dismiss install task">Dismiss</button></div>
      <p>{state.task.platform === "ios" ? <>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</> : "Add Drip to your Home Screen for quick access and offline tracking."}</p>
      <div className="row-gap">
        {state.available && <button className="btn small" disabled={state.busy} onClick={state.install}>Install</button>}
        <button className="btn ghost small" disabled={state.busy} onClick={state.finish}>I&apos;ve added Drip</button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
    </>}
  </section>;
}
