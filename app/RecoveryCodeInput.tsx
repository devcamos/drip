"use client";
import { useEffect, useRef, useState } from "react";
import { MAX_RECOVERY_FILE_BYTES, parseRecoveryCodesFile, RecoveryFileError } from "@/lib/recovery-file";

export function RecoveryCodeInput({ id, value, onChange, label = "Recovery code", disabled = false }: Readonly<{ id: string; value: string; onChange: (code: string) => void; label?: string; disabled?: boolean }>) {
  const [codes, setCodes] = useState<string[]>([]); const [message, setMessage] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (disabled) request.current++; }, [disabled]);
  return <div className="recovery-code-input">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="password" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={value} disabled={disabled} onChange={event => { request.current++; setCodes([]); setMessage(""); onChange(event.target.value); }} />
    <p className="muted">Paste any one of your saved codes, or choose your downloaded file.</p>
    <label htmlFor={`${id}-file`}>Recovery codes file</label>
    <input id={`${id}-file`} type="file" accept=".txt,text/plain" disabled={disabled} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = "";
      const sequence = ++request.current; setMessage(""); setCodes([]);
      if (!file) return;
      try {
        if (file.size > MAX_RECOVERY_FILE_BYTES) throw new RecoveryFileError("Choose a Drip recovery text file smaller than 32 KB.");
        const found = parseRecoveryCodesFile(await file.text());
        if (sequence !== request.current) return;
        setCodes(found); onChange(found[0]); setMessage(`${found.length} recovery ${found.length === 1 ? "code loaded" : "codes loaded"}. Your file stays on this device.`);
      } catch (error) { if (sequence === request.current) { onChange(""); setMessage(error instanceof RecoveryFileError ? error.message : "Could not read this file. Try again or paste a code."); } }
    }} />
    {codes.length > 1 && <><label htmlFor={`${id}-choice`}>Choose a code from your file</label><select id={`${id}-choice`} disabled={disabled} value={String(codes.indexOf(value))} onChange={event => onChange(codes[Number(event.target.value)])}>{codes.map((code, index) => <option key={code} value={index}>Recovery code {index + 1}</option>)}</select></>}
    {message && <output className="muted">{message}</output>}
  </div>;
}

export function RecoveryHelp() {
  return <details className="panel recovery-help">
    <summary>I can’t find my password or recovery codes</summary>
    <ol>
      <li><b>Check your password manager.</b> Search for Drip or drip-one-xi.vercel.app in Apple Passwords, Google Password Manager or your usual manager.</li>
      <li><b>Look for your downloaded codes.</b> Search Files, Downloads and iCloud Drive for <b>drip-recovery-codes.txt</b>.</li>
      <li><b>Check another device.</b> Keep any unlocked Drip session open. In Settings, a configured unlock passkey can confirm a new password or create recovery codes.</li>
    </ol>
    <p className="muted">Drip currently has no email reset. A gamertag alone cannot decrypt your accounts. If no working unlock method remains, we cannot recover the encrypted data.</p>
    <p className="muted">Keep existing app data while you check these options. Creating a new account will not restore the old one.</p>
  </details>;
}
