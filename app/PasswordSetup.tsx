"use client";
import { useEffect, useState } from "react";
import { passwordRecoveryRoot, passwordUsername, setLoginPassword } from "@/lib/password-login";
import { hasPasskeyUnlock, passkeyRecoveryRoot } from "@/lib/passkey-unlock";
import type { AppData } from "@/lib/types";

export function PasswordSetup({ data }: Readonly<{ data: AppData }>) {
  const [username, setUsername] = useState(data.identity?.handle ?? ""); const [code, setCode] = useState("");
  const [password, setPassword] = useState(""); const [again, setAgain] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [method, setMethod] = useState<"code" | "password" | "passkey">("code");
  const [hasPassword, setHasPassword] = useState(false); const [hasPasskey, setHasPasskey] = useState(false);
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) { setUsername(name); setHasPassword(true); setMethod("password"); } }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setHasPasskey(value); }).catch(() => {}); return () => { active = false; }; }, []);
  return <section className="panel" aria-label="Sign-in and password">
    <h2>Sign-in &amp; password</h2>
    <p className="muted">Set a new password without changing your accounts. Confirm with your current password, a configured unlock passkey, or a recovery code.</p>
    <form className="password-form" onSubmit={async event => {
      event.preventDefault(); setMessage("");
      if (password !== again) { setMessage("Passwords do not match."); return; }
      setBusy(true);
      try {
        let root = code;
        if (method === "passkey") root = await passkeyRecoveryRoot();
        else if (method === "password") root = await passwordRecoveryRoot(code);
        const name = await setLoginPassword(root, username, password, data); setUsername(name); setCode(""); setPassword(""); setAgain(""); setMessage(`Password saved. Sign in as ${name} next time. Keep your recovery codes for a forgotten password.`);
      }
      catch (error) { setMessage((error as Error).name === "NotAllowedError" ? "Passkey confirmation was cancelled. Your password has not changed." : (error as Error).message); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="setup-login-tag">Sign-in gamertag</label>
      <input id="setup-login-tag" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} disabled={busy} />
      <p className="muted">Your sign-in gamertag must be unique. Use 3–16 letters, numbers or underscores.</p>
      <fieldset className="recovery-methods" disabled={busy}><legend>Confirm it’s you</legend>
        {hasPassword && <button type="button" className="btn ghost small" aria-pressed={method === "password"} onClick={() => { setMethod("password"); setCode(""); setMessage(""); }}>Current password</button>}
        {hasPasskey && <button type="button" className="btn ghost small" aria-pressed={method === "passkey"} onClick={() => { setMethod("passkey"); setCode(""); setMessage(""); }}>Saved unlock passkey</button>}
        <button type="button" className="btn ghost small" aria-pressed={method === "code"} onClick={() => { setMethod("code"); setCode(""); setMessage(""); }}>Recovery code</button>
      </fieldset>
      {method === "passkey" ? <p className="muted">Your password manager will ask for Face ID, Touch ID or your device lock when you save. You won’t need your old password or recovery code.</p> : <>
        <label htmlFor="setup-login-code">{method === "password" ? "Current password" : "Recovery code to set or reset your password"}</label>
        <input id="setup-login-code" type="password" autoComplete={method === "password" ? "current-password" : "off"} autoCapitalize="none" value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
      </>}
      <label htmlFor="setup-login-password">New password</label>
      <input id="setup-login-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
      <p className="muted">Use at least 12 characters. You can save it in your password manager.</p>
      <label htmlFor="setup-login-confirm">Confirm password</label>
      <input id="setup-login-confirm" type="password" autoComplete="new-password" value={again} onChange={event => setAgain(event.target.value)} disabled={busy} />
      <button type="submit" className="btn" disabled={busy || !username || (method !== "passkey" && !code) || !password || !again}>{busy ? "Saving password…" : "Save password"}</button>
    </form>
    {message && <output className="muted">{message}</output>}
  </section>;
}
