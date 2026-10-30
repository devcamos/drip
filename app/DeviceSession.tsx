"use client";
import { useEffect, useState } from "react";
import { CloudReturn } from "./CloudRecovery";
import { readCloudState } from "@/lib/cloud";
import { finishDeviceSignOut, readDeviceSession, resumeDevice, signOutDevice, unlockDevice } from "@/lib/device-session";
import type { AppData } from "@/lib/types";
import { hasPasskeyUnlock, unlockWithPasskey } from "@/lib/passkey-unlock";
import { PasswordSignIn } from "./PasswordSignIn";
import { AuthLayout, useAuthScreen, type AuthScreen as AuthRoute } from "./AuthScreen";
import { SignupForm } from "./SignupForm";
import { signUpPassword } from "@/lib/password-login";
import { emptyData } from "@/lib/db";
import { logFailure } from "@/lib/diagnostics";
import { RecoveryCodeInput, RecoveryHelp } from "./RecoveryCodeInput";
import { PwaStatus } from "./PwaStatus";

export function SignOutButton() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function run() {
    setBusy(true); setMessage("");
    try {
      const state = await readCloudState();
      const pending = state?.dirty ? "You have unsynced changes. They will stay on this device and can sync after you sign back in. " : "";
      if (!confirm(`${pending}Sign out of Drip? Your local accounts are kept. Sign back in with your gamertag and password.`)) return;
      await signOutDevice();
    } catch (e) { logFailure("auth", e); setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <><button className="btn ghost small" disabled={busy} onClick={run}>{busy ? "Signing out…" : "Sign out"}</button>{message && <output className="err">{message}</output>}</>;
}

type SignedOutProps = Readonly<{ data?: AppData; verifier?: { salt: string; hash: string }; onSignedIn: () => void | Promise<void>; mode?: "signedOut" | "locked" | "migration" }>;
export function SignedOut(props: SignedOutProps) {
  const { screen, navigate } = useAuthScreen();
  // Reset private form state as part of navigation, before the new screen is
  // interactive. A passive reset effect could erase a password-manager autofill.
  return <SignedOutScreen key={props.mode === "migration" ? "migration" : `${props.mode ?? "signedOut"}:${screen}`} {...props} screen={screen} navigate={navigate} />;
}

function signedOutCopy(mode: NonNullable<SignedOutProps["mode"]>, recovering: boolean, signingUp: boolean) {
  const copy = {
    signedOut: { title: "Sign in to Drip", section: "Sign back in", action: "Recover account" },
    locked: { title: "Sign in to Drip", section: "Open your accounts", action: "Recover account" },
    migration: { title: "Encrypt this device", section: "Protect local accounts", action: "Encrypt local data" },
  }[mode];
  let title = copy.title;
  if (signingUp) title = "Create your account";
  else if (recovering && mode !== "migration") title = "Recover your account";
  let description = "Use your gamertag and password to open your accounts.";
  if (recovering) description = "Choose a way back in. Your saved accounts stay on this device.";
  if (signingUp) description = "Start a new Drip account with a gamertag and password.";
  if (mode === "migration") description = "Enter your saved recovery code to encrypt the accounts already on this device. Your existing copy stays intact until encryption is verified.";
  return { ...copy, title, description };
}

function SignedOutScreen({ data, verifier, onSignedIn, mode = "signedOut", screen, navigate }: SignedOutProps & Readonly<{ screen: AuthRoute; navigate: (next: AuthRoute) => void }>) {
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [remoteMessage, setRemoteMessage] = useState(""); const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false);
  const [passkey, setPasskey] = useState(false);
  const recovering = mode === "migration" || screen === "recover";
  const signingUp = mode !== "migration" && screen === "signup";
  const cloudRecovery = mode !== "migration" && screen === "backup";
  const signingIn = !recovering && !signingUp && !cloudRecovery;
  useEffect(() => { let active = true; void hasPasskeyUnlock().then(value => { if (active) setPasskey(value); }).catch(error => { logFailure("auth", error); }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const session = await readDeviceSession(); if (active) setPending(!!session?.remotePending); }
      catch (error) { logFailure("auth", error); if (active) setRemoteMessage((error as Error).message); }
    };
    const finish = async () => {
      try { await finishDeviceSignOut(); if (active) setRemoteMessage(""); } catch (e) { logFailure("auth", e); if (active) setRemoteMessage((e as Error).message); }
      await refresh();
    };
    const onOnline = () => { void finish(); };
    const onChange = () => { void refresh(); };
    onChange(); onOnline();
    window.addEventListener("online", onOnline); window.addEventListener("drip-session-changed", onChange);
    return () => { active = false; window.removeEventListener("online", onOnline); window.removeEventListener("drip-session-changed", onChange); };
  }, []);
  const copy = signedOutCopy(mode, recovering, signingUp);
  const submitText = busy ? "Unlocking…" : copy.action;
  return <AuthLayout title={cloudRecovery ? "Recover another account" : copy.title}
    description={copy.description}>
    <PwaStatus />
    {signingIn && <PasswordSignIn showTitle={false} onSignedIn={onSignedIn} disabled={busy} onBusyChange={setBusy} />}
    {passkey && recovering && mode !== "migration" && <section className="panel" aria-label="Unlock with your passkey">
      <h2>Use your saved unlock passkey</h2><p className="muted">No password or code needed. You can set a new password in Settings after unlocking.</p>
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { await unlockWithPasskey(); await onSignedIn(); }
        catch (error) { logFailure("auth", error); setMessage((error as Error).name === "NotAllowedError" ? "Passkey unlock was cancelled or unavailable. Try again or use a recovery code." : "Could not unlock with this passkey. Try again or use a recovery code."); }
        finally { setBusy(false); }
      }}>{busy ? "Unlocking…" : "Unlock with passkey"}</button>
      <p className="muted">Use Face ID, Touch ID or your device lock.</p>
    </section>}
    {signingIn && <>
    <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("recover")}>Forgot password?</button></div>
    <div className="auth-footer"><p>New to Drip?</p><button className="btn ghost" disabled={busy} onClick={() => navigate("signup")}>Sign up</button></div>
    </>}
    {signingUp && <SignupForm replaceExisting onBusyChange={setBusy} onCreate={async (identity, password) => {
      await signUpPassword(identity.handle, password, { ...emptyData(), identity }, true);
      await onSignedIn();
    }} />}
    {pending && <output className="banner warn">Drip is locked here. Cloud session sign-out is not yet confirmed; it will retry when you reconnect.</output>}
    {pending && <button className="btn ghost small" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await finishDeviceSignOut(); setPending(!!(await readDeviceSession())?.remotePending); setRemoteMessage(""); }
      catch (error) { logFailure("auth", error); setRemoteMessage((error as Error).message); }
      finally { setBusy(false); }
    }}>Retry cloud sign-out</button>}
    {recovering && <section className="panel">
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try {
        if (verifier) { await resumeDevice(code, verifier, data); }
        else { await unlockDevice(code); }
        setCode(""); await onSignedIn();
      } catch (error) { logFailure("auth", error); setMessage((error as Error).message); } finally { setBusy(false); }
    }}>
      <h2>{mode === "migration" ? copy.section : "Use a recovery code"}</h2>
      {mode !== "migration" && <p className="muted">Unlock your saved accounts, then set a new password in Settings.</p>}
      <RecoveryCodeInput id="device-sign-in-code" value={code} onChange={setCode} disabled={busy} />
      {mode === "migration" && <p className="muted">Use your original code or one of your downloaded codes.</p>}
      <button type="submit" className="btn" disabled={busy || !code}>{submitText}</button>
    </form></section>}
    {recovering && mode !== "migration" && <RecoveryHelp />}
    {recovering && mode !== "migration" && <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("backup")}>Recover a different account</button></div>}
    {cloudRecovery &&
      <CloudReturn fromSignedOut={mode === "signedOut"} replaceExisting codeLabel="Other account recovery code" onRestored={() => onSignedIn()} />
    }
    {(recovering || signingUp || cloudRecovery) && mode !== "migration" && <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("login")}>Back to sign in</button></div>}
    {remoteMessage && <output className="muted">{remoteMessage}</output>}
    {message && <output className="err">{message}</output>}
  </AuthLayout>;
}
