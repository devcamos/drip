"use client";
import { useEffect, useState } from "react";
import { passwordUsername, signInPassword } from "@/lib/password-login";
import { AccountSwitchRequired } from "@/lib/account-switch";

export function PasswordSignIn({ onSignedIn, replaceExisting = false, disabled = false, onBusyChange, showTitle = true }: Readonly<{ onSignedIn: () => void | Promise<void>; replaceExisting?: boolean; disabled?: boolean; onBusyChange?: (value: boolean) => void; showTitle?: boolean }>) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [switchRequest, setSwitchRequest] = useState<AccountSwitchRequired>();
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name) setUsername(name); }).catch(() => {}); return () => { active = false; }; }, []);
  return <form className="panel password-form" aria-label={replaceExisting ? "Other account password sign-in" : "Password sign-in"} onSubmit={async event => {
    event.preventDefault();
    if (switchRequest && !switchRequest.canReplace) return;
    if (replaceExisting && !switchRequest && !confirm("Replace this browser's accounts with this account's cloud copy? Your current account must be synced first.")) return;
    setBusy(true); onBusyChange?.(true); setMessage("");
    try { await signInPassword(username, password, replaceExisting || !!switchRequest, switchRequest?.retained); setPassword(""); setSwitchRequest(undefined); await onSignedIn(); }
    catch (error) {
      if (error instanceof AccountSwitchRequired) { setSwitchRequest(error); setMessage(""); }
      else { setMessage((error as Error).message); }
    }
    finally { setBusy(false); onBusyChange?.(false); }
  }}>
    {showTitle && <h2>Sign in</h2>}
    <label htmlFor={replaceExisting ? "other-login-tag" : "login-tag"}>Sign-in gamertag</label>
    <input id={replaceExisting ? "other-login-tag" : "login-tag"} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => { setUsername(event.target.value); setSwitchRequest(undefined); setMessage(""); }} disabled={busy || disabled} />
    <label htmlFor={replaceExisting ? "other-login-password" : "login-password"}>Password</label>
    <input id={replaceExisting ? "other-login-password" : "login-password"} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy || disabled} />
    {switchRequest && <section className="account-switch" aria-label="Switch saved account">
      <h2>Another account is saved here</h2>
      {switchRequest.canReplace
        ? <p>Sign in as <b>{username}</b> and replace this browser&apos;s saved account with its latest cloud copy? The account currently saved here has synced. Its cloud copy stays available.</p>
        : <p>The saved account has changes that aren&apos;t synced, or has no cloud copy. Sign in to that account and sync it first, or use a different browser to keep both copies.</p>}
      <button type="button" className="btn ghost small" disabled={busy || disabled} onClick={() => { setSwitchRequest(undefined); setPassword(""); setMessage(""); }}>Cancel account switch</button>
    </section>}
    {(!switchRequest || switchRequest.canReplace) && <button type="submit" className="btn" disabled={busy || disabled || !username || !password}>{busy ? "Signing in…" : switchRequest ? "Switch account on this browser" : "Sign in with password"}</button>}
    <p className="muted">Use your gamertag and password on up to two browsers or devices.</p>
    {message && <output role="alert" className="err">{message}</output>}
  </form>;
}
