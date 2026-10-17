"use client";
import { useEffect, useState } from "react";
import { CloudReturn } from "./CloudRecovery";
import { readCloudState } from "@/lib/cloud";
import { finishDeviceSignOut, readDeviceSession, resumeDevice, signOutDevice, unlockDevice } from "@/lib/device-session";
import type { AppData } from "@/lib/types";

export function SignOutButton() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function run() {
    setBusy(true); setMessage("");
    try {
      const state = await readCloudState();
      const pending = state?.dirty ? "You have unsynced changes. They will stay on this device and can sync after you sign back in. " : "";
      if (!confirm(`${pending}Sign out and lock Drip on this device? Your local accounts are kept. You will need your recovery code to sign back in.`)) return;
      await signOutDevice();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <><button className="btn ghost small" disabled={busy} onClick={run}>{busy ? "Signing out…" : "Sign out"}</button>{message && <p role="status" className="err">{message}</p>}</>;
}

export function SignedOut({ data, verifier, onSignedIn, mode = "signedOut" }: { data?: AppData; verifier?: { salt: string; hash: string }; onSignedIn: () => void; mode?: "signedOut" | "locked" | "migration" }) {
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [remoteMessage, setRemoteMessage] = useState(""); const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const session = await readDeviceSession(); if (active) setPending(!!session?.remotePending); };
    const finish = async () => {
      try { await finishDeviceSignOut(); if (active) setRemoteMessage(""); } catch (e) { if (active) setRemoteMessage((e as Error).message); }
      await refresh();
    };
    refresh(); finish(); window.addEventListener("online", finish); window.addEventListener("drip-session-changed", refresh);
    return () => { active = false; window.removeEventListener("online", finish); window.removeEventListener("drip-session-changed", refresh); };
  }, []);
  return <main>
    <h1>{mode === "signedOut" ? "Drip is signed out" : mode === "migration" ? "Encrypt this device" : "Unlock Drip"}</h1>
    <p className="muted">{mode === "migration" ? "Enter your saved recovery code to encrypt the accounts already on this device. Your existing copy stays intact until encryption is verified." : "Your accounts and unsynced changes stay encrypted on this device. Enter a recovery code to unlock them. Cloud sync is paused while locked."}</p>
    {pending && <p className="banner warn" role="status">Drip is locked here. Cloud session sign-out is not yet confirmed; it will retry when you reconnect.</p>}
    {pending && <button className="btn ghost small" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await finishDeviceSignOut(); setRemoteMessage(""); } catch (error) { setRemoteMessage((error as Error).message); }
      finally { setPending(!!(await readDeviceSession())?.remotePending); setBusy(false); }
    }}>Retry cloud sign-out</button>}
    <form className="panel" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try { if (verifier) await resumeDevice(code, verifier, data); else await unlockDevice(code); setCode(""); onSignedIn(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}>
      <h2>{mode === "migration" ? "Protect local accounts" : mode === "locked" ? "Open your accounts" : "Sign back in"}</h2>
      <label htmlFor="device-sign-in-code">Recovery code</label>
      <input id="device-sign-in-code" type="password" autoComplete="off" autoCapitalize="characters" value={code} onChange={e => setCode(e.target.value)} />
      <p className="muted">Use your original code or one of your downloaded codes. Your gamertag alone cannot sign you in.</p>
      <button className="btn" disabled={busy || !code}>{busy ? "Unlocking…" : mode === "migration" ? "Encrypt local data" : mode === "locked" ? "Unlock Drip" : "Sign in"}</button>
    </form>
    <details className="panel"><summary>Use another account</summary>
      <p className="muted">Restore an account with cloud recovery enabled. This replaces the accounts kept here; export any unsynced data first.</p>
      <CloudReturn fromSignedOut={mode === "signedOut"} replaceExisting codeLabel="Other account recovery code" onRestored={() => onSignedIn()} />
    </details>
    {remoteMessage && <p role="status" className="muted">{remoteMessage}</p>}
    {message && <p role="status" className="err">{message}</p>}
  </main>;
}
