"use client";
import { useEffect, useState } from "react";
import { getItem, loadData } from "@/lib/db";
import type { AppData } from "@/lib/types";
import { AuthLayout } from "./AuthScreen";
import { RecoveryCodes } from "./RecoveryCodes";
import { SignOutButton } from "./DeviceSession";

export function SignupRecovery({ onSaved }: Readonly<{ onSaved: () => Promise<void> }>) {
  const [account, setAccount] = useState<{ data: AppData; verifier: { salt: string; hash: string } }>();
  const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await loadData(); const verifier = await getItem<{ salt: string; hash: string }>("verifier");
      if (!verifier) throw new Error("Could not open your account. Sign in again.");
      if (active) { setAccount({ data, verifier }); setError(""); }
    })().catch(() => { if (active) setError("Your account is created. Could not open the recovery step; try again. Your saved account is kept."); });
    return () => { active = false; };
  }, [attempt]);
  return <AuthLayout title="Save your recovery codes" description="Your account is created. Download and confirm your original recovery file to finish signup and open Accounts.">
    {error ? <section className="panel"><p role="alert" className="err">{error}</p><button className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button></section> : account ?
      <RecoveryCodes data={account.data} verifier={account.verifier} onSaved={onSaved} signup /> : <p role="status">Opening recovery setup…</p>}
    <SignOutButton />
  </AuthLayout>;
}
