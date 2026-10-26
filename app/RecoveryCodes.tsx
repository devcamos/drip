"use client";
import { useEffect, useState } from "react";
import { passwordRecoveryRoot, passwordUsername } from "@/lib/password-login";
import * as C from "@/lib/crypto";
import { authClient, connect, readCloudState } from "@/lib/cloud";
import { downloadRecoveryCodes, resolveRecoveryCode } from "@/lib/recovery-codes";
import { originalRecoveryCodes } from "@/lib/original-recovery-codes";
import type { AppData } from "@/lib/types";
import { hasPasskeyUnlock, passkeyRecoveryRoot } from "@/lib/passkey-unlock";
import { confirmRecoveryCodesSaved } from "@/lib/recovery-readiness";
import { passwordUnlockContext } from "@/lib/db";

async function confirmedRecoveryRoot(usePasskey: boolean, usePassword: boolean, code: string) {
  if (usePasskey) return passkeyRecoveryRoot();
  if (usePassword) return passwordRecoveryRoot(code);
  return resolveRecoveryCode(code);
}

function RecoveryCodeField({ usePassword, code, onChange, disabled }: Readonly<{ usePassword: boolean; code: string; onChange: (value: string) => void; disabled: boolean }>) {
  return <>
    <label htmlFor="create-recovery-code">{usePassword ? "Confirm your password" : "Your current recovery code"}</label>
    <input id="create-recovery-code" type="password" autoComplete={usePassword ? "current-password" : "off"} value={code} onChange={event => onChange(event.target.value)} disabled={disabled} />
  </>;
}

export function RecoveryCodes({ data, verifier, onSaved, signup = false }: Readonly<{ data: AppData; verifier: { salt: string; hash: string }; onSaved?: () => void | Promise<void>; signup?: boolean }>) {
  const [code, setCode] = useState(""); const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hasPassword, setHasPassword] = useState(signup); const [usePassword, setUsePassword] = useState(signup);
  const [hasPasskey, setHasPasskey] = useState(false); const [usePasskey, setUsePasskey] = useState(false);
  const [downloaded, setDownloaded] = useState(false); const [saved, setSaved] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [codesVaultId, setCodesVaultId] = useState<string>();
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) { setHasPassword(true); setUsePassword(true); } }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setHasPasskey(value); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => {
    const hide = () => setShowCodes(false);
    const visibility = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("blur", hide); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!showCodes) return;
    const timer = setTimeout(() => setShowCodes(false), 30_000);
    return () => clearTimeout(timer);
  }, [showCodes]);
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const { binding } = await passwordUnlockContext();
      const state = await readCloudState();
      if (!state || state.version === 0) throw new Error("Enable cloud recovery and sync your accounts first.");
      const root = await confirmedRecoveryRoot(usePasskey, usePassword, code);
      if (!(await C.checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
      const session = await authClient.getSession();
      const ownerId = session.data?.user.id === state.userId ? state.userId : (await connect(root, data)).user.id;
      if (ownerId !== state.userId) throw new Error("That is not the connected cloud account.");
      const original = await originalRecoveryCodes(root, state.userId);
      setCodes(original.codes); setShowCodes(false); setCodesVaultId(binding?.vaultId); setCode("");
      setMessage(`Your original six recovery codes are ready. Download the file and keep it somewhere safe.${original.cached ? "" : " This device could not cache them for offline unlock; online recovery still works."}`);
    } catch (e) { setMessage((e as Error).name === "NotAllowedError" ? "Passkey confirmation was cancelled. No recovery codes were changed." : (e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Recovery codes">
    <h2>Your original recovery codes</h2>
    <p className="muted">Your account has one set of six recovery codes. Save the original file somewhere safe. Any one can restore your latest synced cloud copy on a new device. Another set cannot be created.</p>
    {codes.length ? <>
      <ol id="recovery-code-list" className="recovery-list" data-revealed={showCodes}>{codes.map(c => <li key={c}><code>{showCodes ? c : "••••-••••-••••-••••-••••-••••"}</code></li>)}</ol>
      <button className="text-link" aria-expanded={showCodes} aria-controls="recovery-code-list" onClick={() => setShowCodes(!showCodes)}>{showCodes ? "Hide recovery codes" : "Show recovery codes"}</button>
      <div className="row-gap"><button className="btn" onClick={() => { downloadRecoveryCodes(codes, data.identity?.handle); setShowCodes(false); setDownloaded(true); }}>Download recovery codes</button></div>
      {downloaded && !saved && <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await confirmRecoveryCodesSaved(codesVaultId); setShowCodes(false); setSaved(true); setMessage("Recovery setup complete. Keep the file somewhere you can access without this device."); await onSaved?.(); }
        catch { setMessage("Could not save your confirmation. Your downloaded recovery codes still work."); }
        finally { setBusy(false); }
      }}>I’ve saved my recovery codes</button>}
      <p className="muted">This is the original set, each time you download it. Codes stay hidden unless you choose to show them, and hide again after 30 seconds or when you leave the window.</p>
    </> : <>
      {usePasskey ? <p className="muted">Confirm with your saved unlock passkey to open your original recovery file.</p> :
        <RecoveryCodeField usePassword={usePassword} code={code} onChange={setCode} disabled={busy} />}
      <div className="row-gap"><button className="btn" disabled={busy || (!usePasskey && (usePassword ? !code : !C.isValidCode(code)))} onClick={generate}>{busy ? "Opening codes…" : "Open original recovery codes"}</button></div>
      {!signup && hasPasskey && <button className="text-link" disabled={busy} onClick={() => { setUsePasskey(!usePasskey); setCode(""); setMessage(""); }}>{usePasskey ? "Use password or recovery code instead" : "Confirm with saved passkey"}</button>}
      {!signup && hasPassword && !usePasskey && <button className="text-link" disabled={busy} onClick={() => { setUsePassword(!usePassword); setCode(""); setMessage(""); }}>{usePassword ? "Use a recovery code instead" : "Confirm with password instead"}</button>}
    </>}
    {message && <output className="muted">{message}</output>}
  </section>;
}
