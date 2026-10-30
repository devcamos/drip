"use client";
import { useEffect, useState } from "react";
import { disablePasskeyUnlock, enablePasskeyUnlock, hasPasskeyUnlock } from "@/lib/passkey-unlock";
import { passwordRecoveryRoot, passwordUsername } from "@/lib/password-login";

export function PasskeyUnlock({ name }: Readonly<{ name: string }>) {
  const [enabled, setEnabled] = useState<boolean>();
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hasPassword, setHasPassword] = useState(false); const [usePassword, setUsePassword] = useState(false);
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setEnabled(value); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void passwordUsername().then(value => { if (active && value) { setHasPassword(true); setUsePassword(true); } }).catch(() => {}); return () => { active = false; }; }, []);
  let controls = <p className="muted">Checking passkey setup…</p>;
  if (enabled === true) {
    controls = <>
      <p className="ok">Passkey unlock is on for this browser.</p>
      <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await disablePasskeyUnlock(); setEnabled(false); setMessage("Passkey unlock removed from this browser. You can also delete the saved Drip unlock passkey in your password manager."); window.dispatchEvent(new Event("drip-recovery-changed")); }
        catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
      }}>Remove passkey unlock</button>
    </>;
  } else if (enabled === false) {
    controls = <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try { const root = usePassword ? await passwordRecoveryRoot(code) : code; await enablePasskeyUnlock(root, name); setCode(""); setEnabled(true); setMessage("Passkey saved and verified. Use it next time you open Drip; your recovery codes still work."); window.dispatchEvent(new Event("drip-recovery-changed")); }
      catch (error) { setMessage((error as Error).name === "NotAllowedError" ? "Passkey setup was cancelled or unavailable. Your recovery codes still work." : (error as Error).message); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="passkey-setup-code">{usePassword ? "Confirm your password to set up passkey unlock" : "Recovery code to set up passkey unlock"}</label>
      <input id="passkey-setup-code" type="password" autoComplete={usePassword ? "current-password" : "off"} autoCapitalize="none" value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
      <p className="muted">Confirm once, then save and verify a Drip unlock passkey. Older cloud sign-in and app-lock passkeys do not unlock encrypted data.</p>
      <button type="submit" className="btn" disabled={busy || !code}>{busy ? "Setting up…" : "Set up passkey unlock"}</button>
      {hasPassword && <button type="button" className="text-link" disabled={busy} onClick={() => { setUsePassword(!usePassword); setCode(""); setMessage(""); }}>{usePassword ? "Use a recovery code instead" : "Confirm with password instead"}</button>}
    </form>;
  }
  return <section className="panel" aria-label="Passkey unlock">
    <h2>Passkey unlock</h2>
    <p className="muted">Open Drip with a saved passkey using Face ID, Touch ID or your device lock. Save it in Apple Passwords or another compatible password manager.</p>
    <p className="muted">This unlocks encrypted accounts in this browser, including offline. On a new device or after clearing browser data, sign in with your password or use a recovery code.</p>
    {controls}
    {message && <output className="muted">{message}</output>}
  </section>;
}
