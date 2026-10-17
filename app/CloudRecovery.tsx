"use client";
import { useEffect, useState } from "react";
import type { AppData } from "@/lib/types";
import * as C from "@/lib/crypto";
import { authClient, connect, readCloudState, restoreCloud, syncNow, vault, writeCloudState } from "@/lib/cloud";

export function CloudSync() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const run = async () => {
      if (!(await readCloudState())) { if (active) setMessage(""); return; }
      if (!navigator.onLine) { if (active) setMessage("Offline — changes are saved on this device and waiting to sync."); return; }
      try { const m = await syncNow(); if (active) setMessage(m); } catch (e) { if (active) setMessage((e as Error).message); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 1000); };
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    schedule();
    window.addEventListener("drip-data-saved", schedule); window.addEventListener("drip-cloud-changed", schedule); window.addEventListener("online", schedule); window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", onVisible);
    const retry = setInterval(schedule, 60_000);
    return () => { active = false; clearTimeout(timer); clearInterval(retry); window.removeEventListener("drip-data-saved", schedule); window.removeEventListener("drip-cloud-changed", schedule); window.removeEventListener("online", schedule); window.removeEventListener("offline", schedule); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return message ? <p className="muted" role="status">{message}</p> : null;
}

export function CloudReturn({ onRestored, replaceExisting = false }: { onRestored: (d: AppData, code: string) => void; replaceExisting?: boolean }) {
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
        const data = await restoreCloud(code, userId);
        await onRestored(data, code); setCode("");
      }
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Return to your cloud account">
    <h2>Already use Drip?</h2>
    <p className="muted">If you enabled cloud recovery, restore your encrypted accounts here. Your gamertag alone cannot recover them.</p>
    <button className="btn ghost" disabled={busy} onClick={() => run(true)}>Sign in with passkey</button>
    <label htmlFor="cloud-return-code">Recovery code</label>
    <input id="cloud-return-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
    <p className="muted">Your code is needed to decrypt your data on a new device, even after passkey sign-in. It can also recover your account without a passkey.</p>
    <button className="btn" disabled={busy || !C.isValidCode(code)} onClick={() => run(false)}>{busy ? "Connecting…" : "Restore cloud accounts"}</button>
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
}

export function CloudPanel({ data, verifier, onRestored }: { data: AppData; verifier: { salt: string; hash: string }; onRestored: (d: AppData, code: string) => void }) {
  const [available, setAvailable] = useState(false); const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/cloud/status", { cache: "no-store" }).then(r => r.json()).then(v => { if (active) setAvailable(v.available === true); }).catch(() => {});
    const refresh = () => readCloudState().then(s => { if (active) setEnabled(!!s); });
    refresh(); window.addEventListener("drip-cloud-changed", refresh);
    return () => { active = false; window.removeEventListener("drip-cloud-changed", refresh); };
  }, []);
  async function enable() {
    setBusy(true); setMessage("");
    try {
      if (!(await C.checkCode(code, verifier))) throw new Error("That isn't your recovery code.");
      const account = await connect(code, data, true);
      const remote = await vault("GET", undefined, account.user.id);
      if (remote.version > 0) throw new Error("This account already has a cloud copy. Export your local backup, then restore the cloud copy below to avoid overwriting it.");
      await writeCloudState({ userId: account.user.id, identityId: data.identity!.id, key: account.key, version: 0, dirty: true, lastSyncAt: null, generation: crypto.randomUUID(), revision: 0 });
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
      if (!(await C.checkCode(code, verifier))) throw new Error("That isn't your recovery code.");
      const state = await readCloudState(); const account = await connect(code, data);
      if (!state || state.userId !== account.user.id) throw new Error("That is not the connected cloud account. Local data has not changed.");
      setCode(""); setMessage(await syncNow());
    } catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
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
          <button className="btn ghost" disabled={busy || !available} onClick={addPasskey}>Add cloud sign-in passkey</button>
          <button className="btn ghost" disabled={busy} onClick={async () => { await writeCloudState(undefined); setEnabled(false); await authClient.signOut(); setMessage("Cloud disconnected on this device. Its local accounts and the saved cloud copy are kept."); }}>Disconnect this device</button>
        </div>
        <label htmlFor="cloud-resume-code">Recovery code to renew sign-in</label>
        <input id="cloud-resume-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn ghost small" disabled={busy || !available || !C.isValidCode(code)} onClick={reconnect}>Sign in without replacing local data</button>
      </> : <>
        <label htmlFor="cloud-enable-code">Your saved recovery code</label>
        <input id="cloud-enable-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
        <p className="muted">Enable cloud recovery only on a trusted device. This browser will retain a non-exportable encryption key so future changes can sync automatically.</p>
        <button className="btn" disabled={busy || !available || !C.isValidCode(code)} onClick={enable}>{busy ? "Saving…" : "Enable encrypted cloud recovery"}</button>
      </>}
      {message && <p className="muted" role="status">{message}</p>}
    </section>
    <details className="panel"><summary>Restore an existing cloud copy</summary>
      <p className="muted">This replaces this device&apos;s accounts. Export a local backup first if you have unsynced changes.</p>
      <CloudReturn replaceExisting onRestored={(d, c) => { onRestored(d, c); setEnabled(true); }} />
    </details>
  </>;
}
