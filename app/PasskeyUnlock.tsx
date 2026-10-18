"use client";
import { useEffect, useState } from "react";
import { disablePasskeyUnlock, enablePasskeyUnlock, hasPasskeyUnlock } from "@/lib/passkey-unlock";

export function PasskeyUnlock({ name }: Readonly<{ name: string }>) {
  const [enabled, setEnabled] = useState<boolean>();
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setEnabled(value); }); return () => { active = false; }; }, []);
  return <section className="panel" aria-label="Passkey unlock">
    <h2>Passkey unlock</h2>
    <p className="muted">Open Drip with a saved passkey using Face ID, Touch ID or your device lock. Save it in Apple Passwords or another compatible password manager.</p>
    <p className="muted">This unlocks encrypted accounts in this browser, including offline. Keep your recovery codes for a new device, cleared browser data or a lost passkey.</p>
    {enabled === undefined ? <p className="muted">Checking passkey setup…</p> : enabled ? <>
      <p className="ok">Passkey unlock is on for this browser.</p>
      <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await disablePasskeyUnlock(); setEnabled(false); setMessage("Passkey unlock removed from this browser. You can also delete the saved Drip unlock passkey in your password manager."); }
        catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
      }}>Remove passkey unlock</button>
    </> : <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try { await enablePasskeyUnlock(code, name); setCode(""); setEnabled(true); setMessage("Passkey saved and verified. Use it next time you open Drip; your recovery codes still work."); }
      catch (error) { setMessage((error as Error).name === "NotAllowedError" ? "Passkey setup was cancelled or unavailable. Your recovery codes still work." : (error as Error).message); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="passkey-setup-code">Recovery code to set up passkey unlock</label>
      <input id="passkey-setup-code" type="password" autoComplete="off" autoCapitalize="characters" value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
      <p className="muted">Enter a code once, then save and verify a Drip unlock passkey. Older cloud sign-in and app-lock passkeys do not unlock encrypted data.</p>
      <button className="btn" disabled={busy || !code}>{busy ? "Setting up…" : "Set up passkey unlock"}</button>
    </form>}
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
}
