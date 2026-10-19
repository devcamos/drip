"use client";
import { useEffect, useState } from "react";
import { passwordRecoveryRoot, passwordUsername } from "@/lib/password-login";
import * as C from "@/lib/crypto";
import { authClient, connect, readCloudState } from "@/lib/cloud";
import { createRecoveryCodes, downloadRecoveryCodes, registerRecoveryCodes, resolveRecoveryCode } from "@/lib/recovery-codes";
import type { AppData } from "@/lib/types";
export function RecoveryCodes({ data, verifier }: Readonly<{ data: AppData; verifier: { salt: string; hash: string } }>) {
  const [code, setCode] = useState(""); const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hasPassword, setHasPassword] = useState(false); const [usePassword, setUsePassword] = useState(false);
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) { setHasPassword(true); setUsePassword(true); } }).catch(() => {}); return () => { active = false; }; }, []);
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const state = await readCloudState();
      if (!state || state.version === 0) throw new Error("Enable cloud recovery and sync your accounts first.");
      const root = usePassword ? await passwordRecoveryRoot(code) : await resolveRecoveryCode(code);
      if (!(await C.checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
      if (!confirm("Create a new set of six recovery codes? This removes cloud lookup for the previous set. Devices that already recovered with old codes keep access; this does not revoke a compromised code. Keep the new file safe.")) return;
      const session = await authClient.getSession();
      const ownerId = session.data?.user.id === state.userId ? state.userId : (await connect(root, data)).user.id;
      if (ownerId !== state.userId) throw new Error("That is not the connected cloud account.");
      const created = await createRecoveryCodes(root);
      const cached = await registerRecoveryCodes(created.records, state.userId);
      setCodes(created.codes); setCode("");
      setMessage(`Six recovery codes are ready. Download the file and keep it somewhere safe.${cached ? "" : " This device could not cache them for offline unlock; online recovery still works."}`);
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Recovery codes">
    <h2>Six ways back in</h2>
    <p className="muted">Save six separate recovery codes in one file. Any one can restore your latest synced cloud copy on a new device. Each code can be reused; keep them private.</p>
    {codes.length ? <>
      <ol className="recovery-list">{codes.map(c => <li key={c}><code>{c}</code></li>)}</ol>
      <button className="btn" onClick={() => downloadRecoveryCodes(codes, data.identity?.handle)}>Download recovery codes</button>
      <p className="muted">This set is only shown here during this visit. Download it before leaving this screen. Your original recovery code still works.</p>
    </> : <>
      <label htmlFor="create-recovery-code">{usePassword ? "Confirm your password" : "Your current recovery code"}</label>
      <input id="create-recovery-code" type="password" autoComplete={usePassword ? "current-password" : "off"} value={code} onChange={e => setCode(e.target.value)} disabled={busy} />
      <div className="row-gap"><button className="btn" disabled={busy || (usePassword ? !code : !C.isValidCode(code))} onClick={generate}>{busy ? "Creating codes…" : "Create six recovery codes"}</button></div>
      {hasPassword && <button className="text-link" disabled={busy} onClick={() => { setUsePassword(!usePassword); setCode(""); setMessage(""); }}>{usePassword ? "Use a recovery code instead" : "Confirm with password instead"}</button>}
    </>}
    {message && <output className="muted">{message}</output>}
  </section>;
}
