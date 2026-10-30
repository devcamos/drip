"use client";
import { useEffect, useRef, useState } from "react";
import { passwordUsername, signInPassword } from "@/lib/password-login";
import { AccountSwitchRequired } from "@/lib/account-switch";
import { logFailure } from "@/lib/diagnostics";
import { PasswordInput } from "./PasswordInput";

export function PasswordSignIn({ onSignedIn, disabled = false, onBusyChange, showTitle = true }: Readonly<{ onSignedIn: () => void | Promise<void>; disabled?: boolean; onBusyChange?: (value: boolean) => void; showTitle?: boolean }>) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [switchRequest, setSwitchRequest] = useState<AccountSwitchRequired>();
  const edited = useRef(false);
  useEffect(() => { let active = true; void passwordUsername().then(name => { if (active && name && !edited.current) setUsername(name); }).catch(error => { logFailure("auth", error); }); return () => { active = false; }; }, []);
  return <form className="panel password-form" aria-label="Password sign-in" onSubmit={async event => {
    event.preventDefault();
    if (busy || disabled || !username || !password) return;
    if (switchRequest && !switchRequest.canReplace) return;
    setBusy(true); onBusyChange?.(true); setMessage("");
    try { await signInPassword(username, password, !!switchRequest, switchRequest?.retained); setPassword(""); setSwitchRequest(undefined); await onSignedIn(); }
    catch (error) {
      if (error instanceof AccountSwitchRequired) { setSwitchRequest(error); setMessage(""); }
      else { logFailure("auth", error); setMessage(error instanceof Error ? error.message : "Could not sign in. Try again shortly."); }
    }
    finally { setBusy(false); onBusyChange?.(false); }
  }}>
    {showTitle && <h2>Sign in</h2>}
    <label htmlFor="login-tag">Gamertag</label>
    <input id="login-tag" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby="login-hint" value={username} onChange={event => { edited.current = true; setUsername(event.target.value); setSwitchRequest(undefined); setMessage(""); }} disabled={busy || disabled} />
    <p id="login-hint" className="muted">Use your full gamertag, including any numbers.</p>
    <label htmlFor="login-password">Password</label>
    <PasswordInput id="login-password" name="password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setMessage(""); }} disabled={busy || disabled} />
    {switchRequest && <section className="account-switch" aria-label="Switch saved account">
      <h2>Another account is saved here</h2>
      {switchRequest.canReplace
        ? <p>Sign in as <b>{username}</b> and replace this browser&apos;s saved account with its latest cloud copy? The account currently saved here has synced. Its cloud copy stays available.</p>
        : <p>The saved account has changes that aren&apos;t synced, or has no cloud copy. Sign in to that account and sync it first, or use a different browser to keep both copies.</p>}
      <button type="button" className="btn ghost small" disabled={busy || disabled} onClick={() => { setSwitchRequest(undefined); setPassword(""); setMessage(""); }}>Cancel account switch</button>
    </section>}
    {(!switchRequest || switchRequest.canReplace) && <button type="submit" className="btn" disabled={busy || disabled || !username || !password}>{busy ? "Signing in…" : switchRequest ? "Switch account on this browser" : "Sign in"}</button>}
    {message && <output role="alert" className="err">{message}</output>}
  </form>;
}
