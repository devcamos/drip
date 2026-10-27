"use client";
import { useEffect, useState } from "react";
import { loadData, signupRecoveryContext } from "@/lib/db";
import { originalRecoveryCodes } from "@/lib/original-recovery-codes";
import { downloadRecoveryCodes } from "@/lib/recovery-codes";
import { confirmRecoveryCodesSaved } from "@/lib/recovery-readiness";
import { AuthLayout } from "./AuthScreen";
import { SignOutButton } from "./DeviceSession";

type Original = { codes: string[]; vaultId: string; handle?: string };

export function SignupRecovery({ onSaved }: Readonly<{ onSaved: () => Promise<void> }>) {
  const [original, setOriginal] = useState<Original>();
  const [opening, setOpening] = useState(true); const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0); const [showCodes, setShowCodes] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    setOpening(true); setError("");
    void (async () => {
      const context = await signupRecoveryContext();
      const data = await loadData();
      const file = await originalRecoveryCodes(context.root, context.ownerId, controller.signal);
      if (file.vaultId !== context.vaultId) throw new Error("Account changed.");
      if (active) {
        setOriginal({ codes: file.codes, vaultId: file.vaultId, handle: data.identity?.handle });
        setShowCodes(document.visibilityState !== "hidden");
      }
    })().catch(() => {
      if (active) setError("Your account is saved. Could not open your recovery codes. Try again when connected.");
    }).finally(() => { clearTimeout(timer); if (active) setOpening(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [attempt]);

  useEffect(() => {
    const hide = () => setShowCodes(false);
    const visibility = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("blur", hide); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  async function finish() {
    if (!original || !acknowledged || busy) return;
    setBusy(true); setMessage("");
    try {
      await confirmRecoveryCodesSaved(original.vaultId);
      setShowCodes(false);
      await onSaved();
    } catch { setMessage("Could not save your confirmation. Your codes still work. Try again."); }
    finally { setBusy(false); }
  }

  return <AuthLayout title="Save your recovery codes" description="Your account is ready. Download these codes or take a screenshot, then continue to Accounts.">
    {opening && <output>Opening your recovery codes…</output>}
    {!opening && error && <section className="panel"><p role="alert" className="err">{error}</p><button className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>}
    {!opening && !error && original && <section className="panel signup-recovery" aria-label="Recovery codes">
      <h2>Your six recovery codes</h2>
      <p className="muted">Keep a copy somewhere safe. Any one of these codes can recover your account if you forget your password.</p>
      <ol id="signup-recovery-codes" className="recovery-list" data-revealed={showCodes}>{original.codes.map(code => <li key={code}><code>{showCodes ? code : "••••-••••-••••-••••-••••-••••"}</code></li>)}</ol>
      <button className="text-link" aria-expanded={showCodes} aria-controls="signup-recovery-codes" onClick={() => setShowCodes(value => !value)}>{showCodes ? "Hide recovery codes" : "Show recovery codes"}</button>
      <div className="row-gap"><button className="btn ghost" disabled={busy} onClick={() => {
        setMessage("");
        try { downloadRecoveryCodes(original.codes, original.handle); }
        catch { setMessage("Could not download the file. Take a screenshot or try again."); }
      }}>Download recovery codes</button></div>
      <label className="check-label"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />I’ve saved a screenshot or a copy of these codes</label>
      <div className="row-gap"><button className="btn" disabled={!acknowledged || busy} onClick={finish}>{busy ? "Finishing…" : "Continue to Accounts"}</button></div>
      <p className="muted">This is your one original set. Keep it private: anyone with a code can recover your synced accounts.</p>
      {message && <p role="alert" className="err">{message}</p>}
    </section>}
    <SignOutButton />
  </AuthLayout>;
}
