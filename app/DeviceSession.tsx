"use client";
import { useEffect, useState } from "react";
import { CloudReturn } from "./CloudRecovery";
import { readCloudState } from "@/lib/cloud";
import { finishDeviceSignOut, readDeviceSession, resumeDevice, signOutDevice, unlockDevice } from "@/lib/device-session";
import type { AppData } from "@/lib/types";
import { hasPasskeyUnlock, unlockWithPasskey } from "@/lib/passkey-unlock";
import { PasswordSignIn } from "./PasswordSignIn";
import { AuthLayout, useAuthScreen } from "./AuthScreen";
import { SignupForm } from "./SignupForm";
import { signUpPassword } from "@/lib/password-login";
import { emptyData } from "@/lib/db";
import { RecoveryCodeInput, RecoveryHelp } from "./RecoveryCodeInput";

export function SignOutButton() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function run() {
    setBusy(true); setMessage("");
    try {
      const state = await readCloudState();
      const pending = state?.dirty ? "You have unsynced changes. They will stay on this device and can sync after you sign back in. " : "";
      if (!confirm(`${pending}Sign out and lock Drip on this device? Your local accounts are kept. Sign back in with your gamertag and password or configured passkey. Recovery codes are available if you forgot your password.`)) return;
      await signOutDevice();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <><button className="btn ghost small" disabled={busy} onClick={run}>{busy ? "Signing out…" : "Sign out"}</button>{message && <output className="err">{message}</output>}</>;
}

export function SignedOut({ data, verifier, onSignedIn, mode = "signedOut" }: Readonly<{ data?: AppData; verifier?: { salt: string; hash: string }; onSignedIn: () => void | Promise<void>; mode?: "signedOut" | "locked" | "migration" }>) {
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [remoteMessage, setRemoteMessage] = useState(""); const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false);
  const [passkey, setPasskey] = useState(false);
  const { screen, navigate } = useAuthScreen();
  const recovering = mode === "migration" || screen === "recover";
  const signingUp = mode !== "migration" && screen === "signup";
  const otherRecovery = screen === "other-recover" && mode !== "migration";
  useEffect(() => { setCode(""); setMessage(""); }, [screen]);
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setPasskey(value); }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const session = await readDeviceSession(); if (active) setPending(!!session?.remotePending); }
      catch (error) { if (active) setRemoteMessage((error as Error).message); }
    };
    const finish = async () => {
      try { await finishDeviceSignOut(); if (active) setRemoteMessage(""); } catch (e) { if (active) setRemoteMessage((e as Error).message); }
      await refresh();
    };
    const onOnline = () => { void finish(); };
    const onChange = () => { void refresh(); };
    onChange(); onOnline();
    window.addEventListener("online", onOnline); window.addEventListener("drip-session-changed", onChange);
    return () => { active = false; window.removeEventListener("online", onOnline); window.removeEventListener("drip-session-changed", onChange); };
  }, []);
  const copy = {
    signedOut: { title: "Drip is signed out", section: "Sign back in", action: "Sign in" },
    locked: { title: "Unlock Drip", section: "Open your accounts", action: "Unlock Drip" },
    migration: { title: "Encrypt this device", section: "Protect local accounts", action: "Encrypt local data" },
  }[mode];
  const submitText = busy ? "Unlocking…" : copy.action;
  const title = signingUp ? "Create your account" : recovering && mode !== "migration" ? "Recover your account" : copy.title;
  const otherTitle = otherRecovery ? "Recover another account" : "Sign in to another account";
  let description = "Sign in with your gamertag and password. Your accounts stay encrypted while signed out.";
  if (recovering) description = "Choose a way back in. Your saved accounts stay on this device.";
  if (signingUp) description = "Start a new Drip account with a gamertag and password.";
  if (mode === "migration") description = "Enter your saved recovery code to encrypt the accounts already on this device. Your existing copy stays intact until encryption is verified.";
  return <AuthLayout title={screen === "other" || otherRecovery ? otherTitle : title}
    description={description}>
    {!recovering && !signingUp && screen !== "other" && !otherRecovery && <>
    <PasswordSignIn showTitle={false} onSignedIn={onSignedIn} disabled={busy} onBusyChange={setBusy} />
    </>}
    {passkey && (recovering || (!signingUp && screen !== "other" && !otherRecovery)) && mode !== "migration" && <section className="panel" aria-label="Unlock with your passkey">
      {recovering && <><h2>Use your saved unlock passkey</h2><p className="muted">No password or code needed. You can set a new password in Settings after unlocking.</p></>}
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await unlockWithPasskey(); await onSignedIn(); }
        catch (error) { setMessage((error as Error).name === "NotAllowedError" ? "Passkey unlock was cancelled or unavailable. Try again or use a recovery code." : "Could not unlock with this passkey. Try again or use a recovery code."); }
        finally { setBusy(false); }
      }}>{busy ? "Unlocking…" : "Unlock with passkey"}</button>
      <p className="muted">Use Face ID, Touch ID or your device lock.</p>
    </section>}
    {!recovering && !signingUp && screen !== "other" && !otherRecovery && <>
    <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("recover")}>Forgot password?</button></div>
    <div className="auth-footer"><p>New to Drip?</p><button className="btn ghost" disabled={busy} onClick={() => navigate("signup")}>Sign up</button>
      <button className="text-link" disabled={busy} onClick={() => navigate("other")}>Use another account</button></div>
    </>}
    {signingUp && <SignupForm replaceExisting onBusyChange={setBusy} onCreate={async (identity, password) => {
      await signUpPassword(identity.handle, password, { ...emptyData(), identity }, true);
      await onSignedIn();
    }} />}
    {pending && <output className="banner warn">Drip is locked here. Cloud session sign-out is not yet confirmed; it will retry when you reconnect.</output>}
    {pending && <button className="btn ghost small" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await finishDeviceSignOut(); setPending(!!(await readDeviceSession())?.remotePending); setRemoteMessage(""); }
      catch (error) { setRemoteMessage((error as Error).message); }
      finally { setBusy(false); }
    }}>Retry cloud sign-out</button>}
    {recovering && <section className="panel">
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try {
        if (verifier) { await resumeDevice(code, verifier, data); }
        else { await unlockDevice(code); }
        setCode(""); await onSignedIn();
      } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}>
      <h2>{mode === "migration" ? copy.section : "Use a recovery code"}</h2>
      {mode !== "migration" && <p className="muted">Unlock your saved accounts, then set a new password in Settings.</p>}
      <RecoveryCodeInput id="device-sign-in-code" value={code} onChange={setCode} disabled={busy} />
      {mode === "migration" && <p className="muted">Use your original code or one of your downloaded codes.</p>}
      <button type="submit" className="btn" disabled={busy || !code}>{submitText}</button>
    </form></section>}
    {recovering && mode !== "migration" && <RecoveryHelp />}
    {screen === "other" && mode !== "migration" && <>
      <p className="muted">Restore an account with cloud recovery enabled. This replaces the accounts kept here; export any unsynced data first.</p>
      <PasswordSignIn showTitle={false} onSignedIn={onSignedIn} replaceExisting disabled={busy} onBusyChange={setBusy} />
      <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("other-recover")}>Forgot password?</button></div>
    </>}
    {otherRecovery &&
      <CloudReturn fromSignedOut={mode === "signedOut"} replaceExisting codeLabel="Other account recovery code" onRestored={() => onSignedIn()} />
    }
    {(recovering || signingUp || screen === "other" || otherRecovery) && mode !== "migration" && <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("login")}>Back to sign in</button></div>}
    {remoteMessage && <output className="muted">{remoteMessage}</output>}
    {message && <output className="err">{message}</output>}
  </AuthLayout>;
}
