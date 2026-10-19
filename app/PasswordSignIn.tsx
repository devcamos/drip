"use client";
import { useEffect, useState } from "react";
import { passwordUsername, signInPassword } from "@/lib/password-login";

export function PasswordSignIn({ onSignedIn, replaceExisting = false, disabled = false, onBusyChange, showTitle = true }: Readonly<{ onSignedIn: () => void | Promise<void>; replaceExisting?: boolean; disabled?: boolean; onBusyChange?: (value: boolean) => void; showTitle?: boolean }>) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) setUsername(name); }).catch(() => {}); return () => { active = false; }; }, []);
  return <form className="panel password-form" aria-label={replaceExisting ? "Other account password sign-in" : "Password sign-in"} onSubmit={async event => {
    event.preventDefault();
    if (replaceExisting && !confirm("Replace this browser's accounts with this account's cloud copy? Export any unsynced changes first.")) return;
    setBusy(true); onBusyChange?.(true); setMessage("");
    try { await signInPassword(username, password, replaceExisting); setPassword(""); await onSignedIn(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }}>
    {showTitle && <h2>Sign in</h2>}
    <label htmlFor={replaceExisting ? "other-login-tag" : "login-tag"}>Sign-in gamertag</label>
    <input id={replaceExisting ? "other-login-tag" : "login-tag"} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} disabled={busy || disabled} />
    <label htmlFor={replaceExisting ? "other-login-password" : "login-password"}>Password</label>
    <input id={replaceExisting ? "other-login-password" : "login-password"} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy || disabled} />
    <button type="submit" className="btn" disabled={busy || disabled || !username || !password}>{busy ? "Signing in…" : "Sign in with password"}</button>
    {message && <output className="err">{message}</output>}
  </form>;
}
