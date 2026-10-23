"use client";
import { useEffect, useState } from "react";
import { passwordRecoveryRoot, passwordUsername } from "@/lib/password-login";
import * as C from "@/lib/crypto";
import { authClient, connect, readCloudState } from "@/lib/cloud";
import { createRecoveryCodes, downloadRecoveryCodes, registerRecoveryCodes, resolveRecoveryCode } from "@/lib/recovery-codes";
import type { AppData } from "@/lib/types";
import { hasPasskeyUnlock, passkeyRecoveryRoot } from "@/lib/passkey-unlock";
import { confirmRecoveryCodesSaved } from "@/lib/recovery-readiness";
import { passwordUnlockContext } from "@/lib/db";
export function RecoveryCodes({ data, verifier }: Readonly<{ data: AppData; verifier: { salt: string; hash: string } }>) {
  const [code, setCode] = useState(""); const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hasPassword, setHasPassword] = useState(false); const [usePassword, setUsePassword] = useState(false);
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
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const { binding } = await passwordUnlockContext();
      const state = await readCloudState();
      if (!state || state.version === 0) throw new Error("Enable cloud recovery and sync your accounts first.");
      const root = usePasskey ? await passkeyRecoveryRoot() : usePassword ? await passwordRecoveryRoot(code) : await resolveRecoveryCode(code);
      if (!(await C.checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
      if (!confirm("Create a new set of six recovery codes? This removes cloud lookup for the previous set. Devices that already recovered with old codes keep access; this does not revoke a compromised code. Keep the new file safe.")) return;
      const session = await authClient.getSession();
      const ownerId = session.data?.user.id === state.userId ? state.userId : (await connect(root, data)).user.id;
      if (ownerId !== state.userId) throw new Error("That is not the connected cloud account.");
      const created = await createRecoveryCodes(root);
      const cached = await registerRecoveryCodes(created.records, state.userId);
      setCodes(created.codes); setShowCodes(false); setCodesVaultId(binding?.vaultId); setCode("");
      setMessage(`Six recovery codes are ready. Download the file and keep it somewhere safe.${cached ? "" : " This device could not cache them for offline unlock; online recovery still works."}`);
    } catch (e) { setMessage((e as Error).name === "NotAllowedError" ? "Passkey confirmation was cancelled. No recovery codes were changed." : (e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Recovery codes">
    <h2>Six ways back in</h2>
    <p className="muted">Save six separate recovery codes in one file. Any one can restore your latest synced cloud copy on a new device. Each code can be reused; keep them private.</p>
    {codes.length ? <>
      <ol id="recovery-code-list" className="recovery-list" data-revealed={showCodes}>{codes.map(c => <li key={c}><code>{showCodes ? c : "••••-••••-••••-••••-••••-••••"}</code></li>)}</ol>
      <button className="text-link" aria-expanded={showCodes} aria-controls="recovery-code-list" onClick={() => setShowCodes(!showCodes)}>{showCodes ? "Hide recovery codes" : "Show recovery codes"}</button>
      <div className="row-gap"><button className="btn" onClick={() => { downloadRecoveryCodes(codes, data.identity?.handle); setShowCodes(false); setDownloaded(true); }}>Download recovery codes</button></div>
      {downloaded && !saved && <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await confirmRecoveryCodesSaved(codesVaultId); setShowCodes(false); setSaved(true); setMessage("Recovery setup complete. Keep the file somewhere you can access without this device."); }
        catch { setMessage("Could not save your confirmation. Your downloaded recovery codes still work."); }
        finally { setBusy(false); }
      }}>I’ve saved my recovery codes</button>}
      <p className="muted">Download the file before leaving. Codes stay hidden unless you choose to show them, and hide again when you leave the window. Your original recovery code still works.</p>
    </> : <>
      {usePasskey ? <p className="muted">Confirm with your saved unlock passkey to create codes without your password or an old code.</p> : <>
        <label htmlFor="create-recovery-code">{usePassword ? "Confirm your password" : "Your current recovery code"}</label>
        <input id="create-recovery-code" type="password" autoComplete={usePassword ? "current-password" : "off"} value={code} onChange={e => setCode(e.target.value)} disabled={busy} />
      </>}
      <div className="row-gap"><button className="btn" disabled={busy || (!usePasskey && (usePassword ? !code : !C.isValidCode(code)))} onClick={generate}>{busy ? "Creating codes…" : "Create six recovery codes"}</button></div>
      {hasPasskey && <button className="text-link" disabled={busy} onClick={() => { setUsePasskey(!usePasskey); setCode(""); setMessage(""); }}>{usePasskey ? "Use password or recovery code instead" : "Confirm with saved passkey"}</button>}
      {hasPassword && !usePasskey && <button className="text-link" disabled={busy} onClick={() => { setUsePassword(!usePassword); setCode(""); setMessage(""); }}>{usePassword ? "Use a recovery code instead" : "Confirm with password instead"}</button>}
    </>}
    {message && <output className="muted">{message}</output>}
  </section>;
}
