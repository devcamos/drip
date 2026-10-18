"use client";
import { useEffect, useState } from "react";
import type { AppData } from "@/lib/types";
import { restoreOtherAccount } from "@/lib/device-session";
import { getItem } from "@/lib/db";
import { resolveRecoveryCode } from "@/lib/recovery-codes";
import * as C from "@/lib/crypto";
import { authClient, connect, readCloudState, restoreCloud, syncNow, vault, writeCloudState } from "@/lib/cloud";
type OnRestored = (data: AppData, code: string) => void | Promise<void>;

export function CloudSync({ hasData = false }: Readonly<{ hasData?: boolean }>) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const run = async () => {
      if (!active) return;
      try {
        const state = await readCloudState();
        if (!active) return;
        if (!state) {
          setMessage(hasData ? "Saved on this device only. Enable cloud recovery to keep a copy if this browser is cleared." : "");
          return;
        }
        if (!navigator.onLine) {
          setMessage("Offline — changes are saved on this device and waiting to sync.");
          return;
        }
        const m = await syncNow(); if (active) setMessage(m);
      } catch (e) { if (active) setMessage((e as Error).message); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void run(); }, 1000); };
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    schedule();
    window.addEventListener("drip-data-saved", schedule); window.addEventListener("drip-cloud-changed", schedule); window.addEventListener("online", schedule); window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", onVisible);
    const retry = setInterval(schedule, 60_000);
    return () => { active = false; clearTimeout(timer); clearInterval(retry); window.removeEventListener("drip-data-saved", schedule); window.removeEventListener("drip-cloud-changed", schedule); window.removeEventListener("online", schedule); window.removeEventListener("offline", schedule); document.removeEventListener("visibilitychange", onVisible); };
  }, [hasData]);
  return message ? <output className="muted">{message}</output> : null;
}

export function CloudReturn({ onRestored, replaceExisting = false, fromSignedOut = false, codeLabel }: Readonly<{ onRestored: OnRestored; replaceExisting?: boolean; fromSignedOut?: boolean; codeLabel?: string }>) {
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string>();
  async function run(passkey: boolean) {
    setBusy(true); setMessage("");
    try {
      if (passkey) {
        const result = await authClient.signIn.passkey();
        if (result.error) throw new Error("Passkey sign-in did not finish. Try again or use your recovery code.");
        const session = await authClient.getSession();
        if (!session.data) throw new Error("Could not sign in.");
        setUserId(session.data.user.id); setMessage("Signed in. Enter your recovery code to decrypt your cloud copy on this device.");
      } else {
        if (replaceExisting && !confirm("Replace this device's accounts with the cloud copy? Export a local backup first if you have unsynced changes.")) return;
        const root = await resolveRecoveryCode(code);
        const data = fromSignedOut ? await restoreOtherAccount(root) : await restoreCloud(root, userId);
        await onRestored(data, root); setCode("");
      }
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Return to your cloud account">
    <h2>Already use Drip?</h2>
    <p className="muted">If you enabled cloud recovery, restore your encrypted accounts here. Your gamertag alone cannot recover them.</p>
    {!fromSignedOut && <button className="btn ghost" disabled={busy} onClick={() => run(true)}>Sign in with passkey</button>}
    <label htmlFor="cloud-return-code">{codeLabel ?? (fromSignedOut ? "Other account recovery code" : "Recovery code")}</label>
    <input id="cloud-return-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
    <p className="muted">{fromSignedOut ? "Use a code for the account you want to restore. This replaces the local accounts on this device." : "Your code is needed to decrypt your data on a new device, even after passkey sign-in. It can also recover your account without a passkey."}</p>
    <button className="btn" disabled={busy || !C.isValidCode(code)} onClick={() => run(false)}>{busy ? "Connecting…" : "Restore cloud accounts"}</button>
    {message && <output className="muted">{message}</output>}
  </section>;
}

export function CloudPanel({ data, verifier, onRestored }: Readonly<{ data: AppData; verifier: { salt: string; hash: string }; onRestored: OnRestored }>) {
  const [available, setAvailable] = useState(false); const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/cloud/status", { cache: "no-store" }).then(r => r.json()).then(v => { if (active) setAvailable(v.available === true); }).catch(() => {});
    const refresh = () => {
      readCloudState().then(s => { if (active) setEnabled(!!s); }).catch(error => { if (active) setMessage((error as Error).message); });
    };
    refresh(); window.addEventListener("drip-cloud-changed", refresh);
    return () => { active = false; window.removeEventListener("drip-cloud-changed", refresh); };
  }, []);
  async function enable() {
    setBusy(true); setMessage("");
    try {
      const device = await getItem<{ generation: string }>("deviceSession");
      const root = await resolveRecoveryCode(code);
      if (!(await C.checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
      const account = await connect(root, data, true);
      const remote = await vault("GET", undefined, account.user.id);
      if (remote.version > 0) throw new Error("This account already has a cloud copy. Export your local backup, then restore the cloud copy below to avoid overwriting it.");
      await writeCloudState({ userId: account.user.id, identityId: data.identity!.id, key: account.key, version: 0, dirty: true, lastSyncAt: null, generation: crypto.randomUUID(), revision: 0 }, { generation: device?.generation });
      setEnabled(true);
      setMessage(await syncNow()); setCode("");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function addPasskey() {
    setBusy(true); setMessage("");
    try {
      const state = await readCloudState(); const session = await authClient.getSession();
      if (!state || state.userId !== session.data?.user.id) throw new Error("Sign in to the connected cloud account before adding a passkey.");
      const result = await authClient.passkey.addPasskey({ name: data.identity?.handle ?? "Drip", fetchOptions: { headers: { "X-Drip-Owner": state.userId } } });
      if (result.error) throw new Error("Passkey was not saved. Your recovery code still works; you can retry later.");
      setMessage("Cloud sign-in passkey saved. Keep your recovery code for decryption and recovery.");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function reconnect() {
    setBusy(true); setMessage("");
    try {
      const root = await resolveRecoveryCode(code);
      if (!(await C.checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
      const state = await readCloudState(); const account = await connect(root, data);
      if (state?.userId !== account.user.id) throw new Error("That is not the connected cloud account. Local data has not changed.");
      setCode(""); setMessage(await syncNow());
    } catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setMessage("");
    try {
      const device = await getItem<{ generation: string }>("deviceSession");
      const state = await readCloudState();
      if (!state) throw new Error("Cloud connection changed. Check its status before disconnecting.");
      const result = await authClient.signOut({ fetchOptions: { headers: { "X-Drip-Disconnect": device?.generation ?? "initial", "X-Drip-Owner": state.userId } } });
      if (result.error) throw new Error("Could not disconnect cloud recovery. Your connection and unsynced changes are kept; retry online.");
      await writeCloudState(undefined, { generation: device?.generation, connectionGeneration: state.generation });
      setEnabled(false); setMessage("Cloud disconnected on this device. Its encrypted local accounts and the saved cloud copy are kept.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <>
    <section className="panel" aria-label="Cloud recovery">
      <h2>Cloud recovery</h2>
      <p className="muted">An encrypted copy keeps your accounts recoverable if this browser is cleared or you change devices. No real name or email needed. Your code never leaves this browser; keep it somewhere safe.</p>
      {!available && <p className="muted">Cloud is unavailable here. Local tracking and exported backups still work.</p>}
      {enabled ? <>
        <p className="ok">Cloud recovery is connected on this device.</p>
        <div className="row-gap">
          <button className="btn" disabled={busy || !available} onClick={async () => { setBusy(true); try { setMessage(await syncNow()); } catch(e) { setMessage((e as Error).message); } finally { setBusy(false); } }}>Sync now</button>
        </div>
        <details className="cloud-options"><summary>Device sign-in options</summary><div className="row-gap">
          <button className="btn ghost" disabled={busy || !available} onClick={addPasskey}>Add cloud sign-in passkey</button>
          <button className="btn ghost" disabled={busy} onClick={disconnect}>Disconnect this device</button>
        </div>
        <label htmlFor="cloud-resume-code">Recovery code to renew sign-in</label>
        <input id="cloud-resume-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn ghost small" disabled={busy || !available || !C.isValidCode(code)} onClick={reconnect}>Sign in without replacing local data</button>
        </details>
      </> : <>
        <label htmlFor="cloud-enable-code">Your saved recovery code</label>
        <input id="cloud-enable-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
        <p className="muted">Enable cloud recovery only on a trusted device. Keys stay in memory while Drip is unlocked. Reopen with your configured passkey or a recovery code; sync pauses while locked.</p>
        <button className="btn" disabled={busy || !available || !C.isValidCode(code)} onClick={enable}>{busy ? "Saving…" : "Enable encrypted cloud recovery"}</button>
      </>}
      {message && <output className="muted">{message}</output>}
    </section>
    <details className="panel"><summary>Restore an existing cloud copy</summary>
      <p className="muted">This replaces this device&apos;s accounts. Export a local backup first if you have unsynced changes.</p>
      <CloudReturn replaceExisting onRestored={async (d, c) => { await onRestored(d, c); setEnabled(true); }} />
    </details>
  </>;
}
