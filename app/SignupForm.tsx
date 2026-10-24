"use client";
import { useState } from "react";
import { handleError, newIdentity, type Identity } from "@/lib/identity";
import { passwordError } from "@/lib/password-crypto";
import { PasswordInput } from "./PasswordInput";

export function SignupForm({ onCreate, initialHandle = "", onHandleChange, onBusyChange, replaceExisting = false }: Readonly<{
  onCreate: (identity: Identity, password: string) => Promise<void>;
  initialHandle?: string;
  onHandleChange?: (handle: string) => void;
  onBusyChange?: (busy: boolean) => void;
  replaceExisting?: boolean;
}>) {
  const [handle, setHandle] = useState(initialHandle);
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const validHandle = !!handle && !handleError(handle);
  return <form className="panel auth-signup" aria-label="Sign up" onSubmit={async event => {
    event.preventDefault();
    if (busy || !validHandle || passwordError(password) || password !== confirmation || (replaceExisting && !confirmed)) return;
    setBusy(true); onBusyChange?.(true); setError("");
    try { await onCreate(newIdentity(handle), password); setPassword(""); setConfirmation(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create your account. Try again."); }
    finally { setBusy(false); onBusyChange?.(false); }
  }}>
    <h2>Your gamertag</h2>
    <label htmlFor="signup-tag">Gamertag (3–16 letters, numbers or _)</label>
    <input id="signup-tag" maxLength={16} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="devo" value={handle} disabled={busy} onChange={event => { const value = event.target.value.trim(); setHandle(value); onHandleChange?.(value); }} />
    {handle && handleError(handle) && <p className="err">{handleError(handle)}</p>}
    {validHandle && <p className="muted" data-testid="tag-preview">You&apos;ll be <b>{handle}</b></p>}
    <p className="muted">No real name, email or phone needed.</p>
    <label htmlFor="new-account-password">Create password</label>
    <PasswordInput id="new-account-password" autoComplete="new-password" minLength={12} maxLength={256} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
    <label htmlFor="new-account-confirm">Confirm new account password</label>
    <PasswordInput id="new-account-confirm" visibilityLabel="password confirmation" autoComplete="new-password" disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} aria-invalid={!!confirmation && password !== confirmation} aria-describedby={confirmation && password !== confirmation ? "signup-password-mismatch" : undefined} />
    {confirmation && password !== confirmation && <p id="signup-password-mismatch" className="err">Passwords do not match.</p>}
    <p className="muted">Use at least 12 characters. You can save it in your password manager.</p>
    {replaceExisting && <>
      <p className="muted">This browser keeps another account. Sign back in and finish syncing it first. A successful signup will open a new, empty account here; your existing cloud copy stays available.</p>
      <label className="signup-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> I can sign back in to my current account and want to use this browser for a new account.</label>
    </>}
    <div className="row-gap"><button type="submit" className="btn" disabled={busy || !validHandle || !!passwordError(password) || password !== confirmation || (replaceExisting && !confirmed)}>{busy ? "Creating account…" : "Create account"}</button></div>
    {error && <p role="alert" className="err">{error}</p>}
  </form>;
}
