"use client";
import { useEffect, useState } from "react";
import { passwordUsername, setLoginPassword } from "@/lib/password-login";
import type { AppData } from "@/lib/types";
import { PasswordInput } from "./PasswordInput";

export function PasswordSetup({ data }: Readonly<{ data: AppData }>) {
  const [username, setUsername] = useState(data.identity?.handle ?? ""); const [code, setCode] = useState("");
  const [password, setPassword] = useState(""); const [again, setAgain] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) setUsername(name); }).catch(() => {}); return () => { active = false; }; }, []);
  return <section className="panel" aria-label="Sign-in and password">
    <h2>Sign-in &amp; password</h2>
    <p className="muted">Use your gamertag and password for everyday sign-in. Set a password once for an existing account, or reset it here after recovering access.</p>
    <form className="password-form" onSubmit={async event => {
      event.preventDefault(); setMessage("");
      if (password !== again) { setMessage("Passwords do not match."); return; }
      setBusy(true);
      try { const name = await setLoginPassword(code, username, password, data); setUsername(name); setCode(""); setPassword(""); setAgain(""); setMessage(`Password saved. Sign in as ${name} next time. Keep your recovery codes for a forgotten password.`); }
      catch (error) { setMessage((error as Error).message); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="setup-login-tag">Sign-in gamertag</label>
      <input id="setup-login-tag" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} disabled={busy} />
      <p className="muted">Your sign-in gamertag must be unique. Use 3–16 letters, numbers or underscores.</p>
      <label htmlFor="setup-login-code">Recovery code to set or reset your password</label>
      <input id="setup-login-code" type="password" autoComplete="off" autoCapitalize="characters" value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
      <label htmlFor="setup-login-password">New password</label>
      <PasswordInput id="setup-login-password" visibilityLabel="new password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
      <p className="muted">Use at least 12 characters. You can save it in your password manager.</p>
      <label htmlFor="setup-login-confirm">Confirm password</label>
      <PasswordInput id="setup-login-confirm" visibilityLabel="password confirmation" autoComplete="new-password" value={again} onChange={event => setAgain(event.target.value)} disabled={busy} />
      <button type="submit" className="btn" disabled={busy || !username || !code || !password || !again}>{busy ? "Saving password…" : "Save password"}</button>
    </form>
    {message && <output className="muted">{message}</output>}
  </section>;
}
