"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData } from "@/lib/types";
import * as M from "@/lib/maths";
import * as C from "@/lib/crypto";
import { commitCloudRestore, getItem, isAppData, loadData, saveData, localVaultStatus } from "@/lib/db";
import * as L from "@/lib/lock";
import * as I from "@/lib/identity";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draft";
import { CloudPanel, CloudReturn, CloudSync } from "./CloudRecovery";
import { PwaStatus } from "./PwaStatus";
import { SignOutButton, SignedOut } from "./DeviceSession";
import { readDeviceSession } from "@/lib/device-session";
import { RecoveryCodes } from "./RecoveryCodes";
import { PasskeyUnlock } from "./PasskeyUnlock";
import { PasswordSetup } from "./PasswordSetup";
import { PasswordSignIn } from "./PasswordSignIn";
import { AuthLayout, useAuthScreen } from "./AuthScreen";
import { setLoginPassword } from "@/lib/password-login";
import { passwordError } from "@/lib/password-crypto";
import { Trends } from "./Trends";
import { AccountForm } from "./AccountForm";
import { AccountDetail } from "./AccountDetail";
import { IncomeSummary } from "./IncomeSummary";
import { productLabel } from "@/lib/products";
import { downloadRecoveryCodes, resolveRecoveryCode } from "@/lib/recovery-codes";

type View = { name: "home" } | { name: "detail"; id: string } | { name: "add"; id?: string } | { name: "trends" } | { name: "settings" };
type Verifier = { salt: string; hash: string };

const today = () => M.ymd(new Date());

export default function Drip() {
  const [gate, setGate] = useState<{ status: Awaited<ReturnType<typeof localVaultStatus>>; signedOut: boolean }>();
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const status = await localVaultStatus(); const session = await readDeviceSession();
      if (id !== sequence.current) return;
      if (status === "unlocked" && !session?.signedOut && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setGate({ status, signedOut: !!session?.signedOut }); setError("");
    } catch { if (id === sequence.current) setError("Could not open local storage. Your stored copy has not been changed. Try again."); }
  }, []);
  useEffect(() => {
    refresh();
    const storage = (event: StorageEvent) => { if (event.key === "drip-session-notify") refresh(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("drip-session-changed", refresh); window.addEventListener("storage", storage); document.addEventListener("visibilitychange", visible);
    return () => { sequence.current++; window.removeEventListener("drip-session-changed", refresh); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  if (error) return <main><p role="alert">{error}</p><button className="btn" onClick={refresh}>Try again</button></main>;
  if (!gate) return <main><p className="muted">Loading…</p></main>;
  if (gate.signedOut) return <SignedOut mode="signedOut" onSignedIn={refresh} />;
  if (gate.status === "locked" || gate.status === "migration") return <SignedOut mode={gate.status} onSignedIn={refresh} />;
  return <UnlockedDrip />;
}

function UnlockedDrip() {
  const [data, setData] = useState<AppData | null>(null);
  const latestData = useRef<AppData | null>(null);
  const dataGeneration = useRef(0);
  const edits = useRef<Promise<unknown>>(Promise.resolve());
  const [pendingSaves, setPendingSaves] = useState(0);
  const replaceData = useCallback((next: AppData) => { dataGeneration.current++; latestData.current = next; setData(next); }, []);
  const [verifier, setVerifier] = useState<Verifier | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: "home" });
  const [installHint, setInstallHint] = useState<"ios" | "android" | null>(null);
  const [deferred, setDeferred] = useState<any>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const loadSequence = useRef(0);
  const [locked, setLocked] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const lockOn = !!data?.lock?.credentialId;
  useEffect(() => {
    if (!data) return;
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (L.shouldLock(lockOn, hiddenAt, Date.now(), false)) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [data, lockOn]);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    (async () => {
      const loaded = await loadData();
      const savedVerifier = (await getItem<Verifier>("verifier")) ?? null;
      const latest = await readDeviceSession();
      if (sequence === loadSequence.current && !latest?.signedOut) {
        replaceData(loaded); setVerifier(savedVerifier);
        if (L.shouldLock(!!loaded.lock?.credentialId, null, Date.now(), true)) setLocked(true);
      }
      if (navigator.storage?.persist) {
        const already = await navigator.storage.persisted?.();
        if (!already) await navigator.storage.persist();
      }
    })().catch(() => setLoadError("Could not read local accounts. Your stored copy has not been changed. Reload Drip and unlock again."));
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!standalone && ios) setInstallHint("ios");
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); if (!standalone) setInstallHint("android"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => { loadSequence.current++; window.removeEventListener("beforeinstallprompt", onPrompt); };
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    const generation = dataGeneration.current;
    setPendingSaves(n => n + 1);
    // Derive each edit from the last confirmed snapshot, after earlier edits settle.
    // A failed action must never become the input to a retry or another edit.
    const operation = edits.current.then(async () => {
      try {
        const previous = latestData.current;
        if (!previous || generation !== dataGeneration.current) return false;
        const next = fn(previous);
        const withSnap = { ...next, snapshots: M.upsertSnapshot(next.snapshots, next.accounts, new Date()) };
        await saveData(withSnap);
        if (latestData.current !== previous || generation !== dataGeneration.current) return false;
        latestData.current = withSnap; setData(withSnap); setSaveError("");
        return true;
      } catch {
        setSaveError("Changes could not be saved. Your saved data is unchanged; retry the action.");
        return false;
      } finally { setPendingSaves(n => n - 1); }
    });
    edits.current = operation;
    return operation;
  }, []);

  if (loadError) return <main><p role="alert">{loadError}</p></main>;
  if (!data || verifier === undefined) return <main><p className="muted">Loading…</p></main>;
  if (verifier === null) return <Onboarding onDone={async (v, restored, identity, fromCloud, expectedGeneration, root, password) => {
    let d = restored ?? { ...data, identity };
    if (restored && !fromCloud) d = { ...restored, lastBackupAt: new Date().toISOString() };
    if (!fromCloud) await commitCloudRestore(d, undefined, v, expectedGeneration, undefined, root);
    await clearDraft();
    let target: View = { name: "home" };
    if (password && root && d.identity) {
      try { await setLoginPassword(root, d.identity.handle, password, d); }
      catch (error) { target = { name: "settings" }; setSaveError(`Your local account is saved. Password setup did not finish: ${(error as Error).message} Retry in Sign-in & password.`); }
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setVerifier(v); setView(target); replaceData(d);
  }} />;
  if (!data.identity) return <main><h1>Pick your gamertag</h1>
    <p className="muted">Drip now gives you a gamertag. It&apos;s stored on this device only and will become your account name when sync arrives.</p>
    <div className="panel"><HandlePicker onPick={async (identity) => {
      if (!identity) return;
      const d = { ...data, identity };
      await saveData(d);
      replaceData(d);
    }} cta="Save gamertag" /></div></main>;

  if (locked && data.lock?.credentialId) return <LockScreen credentialId={data.lock.credentialId} verifier={verifier} onUnlock={() => setLocked(false)} />;

  const banners = (
    <>
      {installHint && !dismissed.install && (
        <div className="banner info">
          {installHint === "ios"
            ? <span>Install Drip: tap <b>Share</b> then <b>Add to Home Screen</b>. Keep cloud recovery or exported backups too; installation alone doesn&apos;t guarantee data retention.</span>
            : <span>Install Drip for quick access and offline tracking.</span>}
          {installHint === "android" && deferred && <button className="btn small" onClick={async () => { deferred.prompt(); setDeferred(null); setInstallHint(null); }}>Install</button>}
          <button className="btn ghost small" onClick={() => setDismissed({ ...dismissed, install: true })}>✕</button>
        </div>
      )}

    </>
  );

  let body: React.ReactNode;
  switch (view.name) {
  case "detail": {
    const a = data.accounts.find((x) => x.id === view.id);
    body = a ? <AccountDetail key={a.id} a={a} onBack={() => setView({ name: "home" })} onEdit={() => setView({ name: "add", id: a.id })}
      onChange={(fn) => update((d) => ({ ...d, accounts: d.accounts.map((x) => x.id === a.id ? fn(x) : x) }))}
      onDelete={() => { if (confirm(`Delete ${a.provider}?`)) { update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) })); setView({ name: "home" }); } }} /> : null;
    break;
  }
  case "add": {
    const existing = view.id ? data.accounts.find((x) => x.id === view.id) : undefined;
    body = <AccountForm key={view.id ?? "new"} existing={existing} onCancel={() => setView({ name: "home" })} onSave={async (a) => {
      const saved = await update((d) => ({ ...d, accounts: d.accounts.some(x => x.id === a.id) ? d.accounts.map((x) => x.id === a.id ? a : x) : [...d.accounts, a] }));
      if (saved) setView({ name: "detail", id: a.id });
      return saved;
    }} />;
    break;
  }
  case "trends":
    body = <Trends data={data} onAssumptions={(projection) => update(d => ({ ...d, projection }))} />;
    break;
  case "settings":
    body = <Settings data={data} verifier={verifier}
    onCloudRestored={async (d) => { setVerifier((await getItem<Verifier>("verifier")) ?? null); replaceData(d); }}
    onLock={(lock) => update((d) => ({ ...d, lock }))}
    onBackedUp={() => update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }))}
    onRestore={async (d, code, expectedGeneration) => { const v = await C.codeVerifier(code); const n = { ...d, lock: undefined, lastBackupAt: new Date().toISOString() }; await commitCloudRestore(n, undefined, v, expectedGeneration, undefined, code); window.dispatchEvent(new Event("drip-cloud-changed")); setVerifier(v); replaceData(n); }} />;
    break;
  default:
    body = <Home data={data} open={(id) => setView({ name: "detail", id })} add={() => setView({ name: "add" })} />;
  }

  return (
    <>
      <main><div className="tagline"><span data-testid="header-tag">💧 Drip · <b>{I.formatTag(data.identity)}</b></span><SignOutButton /></div><output className="muted" hidden={!!saveError} data-testid="local-save-status">{pendingSaves ? "Saving changes…" : "Saved on this device."}</output><PwaStatus /><CloudSync hasData={data.accounts.length > 0} />{saveError && <p role="alert" className="err">{saveError}</p>}{banners}{body}<p className="disclaimer">Drip is for your own tracking. Not financial advice. Figures are estimates before tax.</p></main>
      <nav className="tabs">
        {(["home", "trends", "add", "settings"] as const).map((n) => (
          <button key={n} className={view.name === n || (n === "home" && view.name === "detail") ? "on" : ""} onClick={() => setView({ name: n } as View)}>
            {{ home: "Accounts", trends: "Trends", add: "Add", settings: "Recovery" }[n]}
          </button>
        ))}
      </nav>
    </>
  );
}

function HandlePicker({ onPick, cta, initial = "", onRaw }: Readonly<{ onPick: (i: I.Identity | null) => void; cta?: string; initial?: string; onRaw?: (h: string) => void }>) {
  const [handle, setHandle] = useState(initial);
  const err = handle ? I.handleError(handle) : null;
  const ok = !!handle && !err;
  useEffect(() => { if (!cta) onPick(ok ? I.newIdentity(handle) : null); }, [handle]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <label htmlFor="handle">Gamertag (3–16 letters, numbers or _)</label>
      <input id="handle" value={handle} maxLength={16} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="devo" onChange={(e) => { const h = e.target.value.trim(); setHandle(h); onRaw?.(h); }} />
      {err ? <p className="err">{err}</p> : ok && <p className="muted" data-testid="tag-preview">You&apos;ll be <b style={{ color: "var(--text)" }}>{handle}</b></p>}
      <p className="muted">No name, email or phone needed. Don&apos;t use your real name if you&apos;d rather not.</p>
      {cta && <button className="btn" disabled={!ok} onClick={() => onPick(I.newIdentity(handle))}>{cta}</button>}
    </>
  );
}

function Onboarding({ onDone }: Readonly<{ onDone: (v: Verifier, restored?: AppData, identity?: I.Identity, fromCloud?: boolean, expectedGeneration?: string, root?: string, password?: string) => void | Promise<void> }>) {
  const [draft, setDraft] = useState<{ handle: string; code: string } | null>(null);
  const [identity, setIdentity] = useState<I.Identity | null>(null);
  useEffect(() => {
    (async () => {
      const d = (await loadDraft()) ?? { handle: "", code: C.generateRecoveryCode() };
      await saveDraft(d); setDraft(d);
    })();
  }, []);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { screen: route, navigate } = useAuthScreen();
  const screen = route === "other" || route === "other-recover" ? "login" : route;
  useEffect(() => { setPassword(""); setConfirmation(""); setError(""); }, [screen]);
  if (!draft) return <main><p className="muted">Loading…</p></main>;
  const code = draft.code;
  async function createAccount(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved || !identity || password !== confirmation || (password && passwordError(password))) return;
    setBusy(true); setError("");
    try { const device = await readDeviceSession(); await onDone(await C.codeVerifier(code), undefined, identity, false, device?.generation, code, password || undefined); setPassword(""); setConfirmation(""); }
    catch { setError("Could not encrypt local accounts. Your recovery code has not changed; try again."); }
    finally { setBusy(false); }
  }
  return (
    <AuthLayout title={screen === "signup" ? "Create your account" : screen === "recover" ? "Recover your account" : screen === "backup" ? "Restore a backup" : "Welcome back"}
      description={screen === "signup" ? "Track your money and the income it earns. No real name, email or phone needed." : screen === "recover" || screen === "backup" ? "Get back to your accounts using a saved recovery code." : "Sign in to your Drip account."}>
      <PwaStatus />
      {screen === "login" && <>
      <PasswordSignIn showTitle={false} disabled={busy} onBusyChange={setBusy} onSignedIn={async () => {
        const restored = await loadData(); const v = await getItem<Verifier>("verifier");
        if (!v) throw new Error("Sign-in could not be completed. Try again.");
        await onDone(v, restored, undefined, true);
      }} />
      <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("recover")}>Forgot password?</button></div>
      <div className="auth-footer"><p>New to Drip?</p><button className="btn ghost" disabled={busy} onClick={() => navigate("signup")}>Create account</button></div>
      </>}
      {screen === "recover" && <>
        <CloudReturn onRestored={async (d, c) => onDone(await C.codeVerifier(c), d, undefined, true)} />
        <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("backup")}>Restore a backup</button></div>
      </>}
      {screen === "signup" && (
        <form className="panel auth-signup" onSubmit={createAccount}>
          <h2>Your gamertag</h2>
          <HandlePicker onPick={setIdentity} initial={draft.handle} onRaw={(h) => saveDraft({ handle: h, code })} />
          <label htmlFor="new-account-password">Create password</label>
          <input id="new-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
          <label htmlFor="new-account-confirm">Confirm new account password</label>
          <input id="new-account-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
          <p className="muted">Use at least 12 characters for normal sign-in and encrypted cloud saving. Leave both blank to start on this device only.</p>
          <h2>Your recovery code</h2>
          <p className="muted">Save this code for a forgotten password or lost device. Use your gamertag and password for normal sign-in. Until you create your account, reloading generates a new code. <b>If you lose all passwords, passkeys and recovery codes, we cannot recover your encrypted data.</b></p>
          <div className="code" data-testid="code">{code}</div>
          <div className="row-gap"><button type="button" className="btn ghost small" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button><button type="button" className="btn ghost small" onClick={() => downloadRecoveryCodes([code], draft.handle)}>Download recovery code</button></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved my recovery code somewhere safe
          </label>
          <div className="row-gap">
            <button type="submit" className="btn" disabled={busy || !saved || !identity || (!!password && (!!passwordError(password) || password !== confirmation)) || (!password && !!confirmation)}>{busy ? "Creating account…" : "Create account"}</button>
          </div>
          {error && <p role="alert" className="err">{error}</p>}
        </form>
      )}
      {screen === "backup" && (
        <div className="panel">
          <Restore onRestored={async (d, c, g) => onDone(await C.codeVerifier(c), d, undefined, false, g, c)} />
          <div className="row-gap"><button className="btn ghost" onClick={() => navigate("recover")}>Back</button></div>
        </div>
      )}
      {screen !== "login" && <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("login")}>Back to sign in</button></div>}
    </AuthLayout>
  );
}

function Home({ data, open, add }: Readonly<{ data: AppData; open: (id: string) => void; add: () => void }>) {
  const t = today();
  const up = M.upcoming(data.accounts, t);
  return (
    <>
      <p className="muted">Total balance</p>
      <div className="big">{M.gbp(M.totalBalance(data.accounts))}</div>
      <p className="muted">Estimated ≈ {M.gbp(M.totalMonthlyIncome(data.accounts))} a month · {M.weightedYield(data.accounts).toFixed(2)}% average</p>
      {data.accounts.length > 0 && <IncomeSummary accounts={data.accounts} />}
      {data.accounts.length === 0 ? (
        <div className="panel"><p>No accounts yet. Add your first savings or investment account to see what it earns.</p><button className="btn" onClick={add}>Add account</button></div>
      ) : (
        <div className="stack">
          {data.accounts.map((a) => {
            const next = M.nextPayout(a.nextPayoutDate, a.frequency, t);
            return (
              <button key={a.id} className="card" onClick={() => open(a.id)}>
                <div className="row"><span className="prov">{a.provider}</span><span className="bal">{M.gbp(a.balance)}</span></div>
                <div className="row meta"><span>{productLabel(a)}{a.label && <> · <span>{a.label}</span></>}</span><span>{a.ratePct}%</span></div>
                <div className="meta" style={{ marginTop: 18 }}>Estimated ≈ {M.gbp(M.monthlyIncome(a.balance, a.ratePct))} a month · {a.frequency === "daily" ? "Daily payments" : `next expected ${fmtDate(next)}`}</div>
              </button>
            );
          })}
        </div>
      )}
      {up.length > 0 && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Upcoming estimated payments</h2>
          <ul className="list">{up.map((p) => <li key={p.account.id}><span>{p.account.provider}<br /><span className="muted">{fmtDate(p.date)}</span></span><b>{M.gbp(p.amount)}</b></li>)}</ul>
        </div>
      )}
    </>
  );
}

function LockScreen({ credentialId, verifier, onUnlock }: Readonly<{ credentialId: string; verifier: Verifier; onUnlock: () => void }>) {
  const [code, setCode] = useState(""); const [err, setErr] = useState("");
  const tryPasskey = async () => { setErr(""); if (await L.verifyPasskey(navigator.credentials, credentialId, location.hostname)) onUnlock(); else setErr("Face ID didn't work. Try again or use your recovery code."); };
  useEffect(() => { tryPasskey(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main><h1>Drip is locked 🔒</h1>
      <div className="panel">
        <button className="btn" onClick={tryPasskey}>Unlock with Face ID / passkey</button>
        <label>Or use your recovery code</label>
        <input aria-label="Unlock recovery code" value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
        <div className="row-gap"><button className="btn ghost" disabled={!code} onClick={async () => { try { if (await C.checkCode(await resolveRecoveryCode(code), verifier)) onUnlock(); else setErr("That isn't your recovery code."); } catch (e) { setErr((e as Error).message); } }}>Unlock with code</button></div>
        {err && <p className="err">{err}</p>}
      </div>
    </main>
  );
}

function Settings({ data, verifier, onBackedUp, onRestore, onLock, onCloudRestored }: Readonly<{ data: AppData; verifier: Verifier; onBackedUp: () => void; onRestore: (d: AppData, code: string, expectedGeneration?: string) => void | Promise<void>; onLock: (l: AppData["lock"]) => void; onCloudRestored: (d: AppData, code: string) => void | Promise<void> }>) {
  const [supported, setSupported] = useState<boolean | null>(null); const [lockMsg, setLockMsg] = useState("");
  useEffect(() => { L.passkeySupported().then(setSupported); }, []);
  const lockPanel = (
    <div className="panel"><h2 style={{ marginTop: 0 }}>App lock</h2>
      <p className="muted">Ask for Face ID (or your device passkey) when Drip opens and after 5 minutes in the background. Your recovery code also unlocks it.</p>
      <p className="muted">This is a screen lock only and keeps keys in memory. Passkey unlock above opens encrypted accounts after a full reload.</p>
      {data.lock?.credentialId ? (
        <button className="btn ghost" onClick={() => { onLock({ credentialId: null, enabledAt: null }); setLockMsg("App lock is off."); }}>Turn off app lock</button>
      ) : supported === false ? <p className="muted">This device or browser doesn&apos;t support a passkey lock.</p> : (
        <button className="btn" disabled={!supported} onClick={async () => {
          try { const id = await L.registerPasskey(navigator.credentials, location.hostname, { id: I.idBytes(data.identity!.id), name: I.formatTag(data.identity!) }); onLock({ credentialId: id, enabledAt: new Date().toISOString() }); setLockMsg("App lock is on."); }
          catch { setLockMsg("Couldn't set up the passkey."); }
        }}>Turn on app lock</button>
      )}
      {lockMsg && <p className="ok">{lockMsg}</p>}
    </div>
  );
  const [code, setCode] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Recovery</h1>
      <p className="muted">Keep your recovery codes safe. They restore your latest synced cloud copy if you change devices or your browser is cleared.</p>
      <PasswordSetup data={data} />
      <PasskeyUnlock name={data.identity ? I.formatTag(data.identity) : "Drip"} />
      <RecoveryCodes data={data} verifier={verifier} />
      <CloudPanel data={data} verifier={verifier} onRestored={onCloudRestored} />
      <details className="panel"><summary>Advanced: file backups &amp; app lock</summary>
      <p className="muted">Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("en-GB") : "never"}</p>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Export</h2>
        <p className="muted">An exported file includes this device&apos;s nicknames. Keep the file private.</p>
        <label>Recovery code</label><input aria-label="Export recovery code" value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
        <div className="row-gap"><button className="btn" disabled={busy || !code} onClick={async () => {
          setBusy(true); setMsg(null);
          try {
            const root = await resolveRecoveryCode(code);
            if (!(await C.checkCode(root, verifier))) { setMsg({ ok: false, t: "That isn't your recovery code." }); return; }
            const file = await C.encryptBackup(data, root);
            const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
            const name = `drip-backup-${today()}.json`;
            const f = new File([blob], name, { type: "application/json" });
            if ((navigator as any).canShare?.({ files: [f] })) await navigator.share({ files: [f], title: "Drip backup" });
            else { const u = URL.createObjectURL(blob); const el = document.createElement("a"); el.href = u; el.download = name; el.click(); URL.revokeObjectURL(u); }
            onBackedUp(); setMsg({ ok: true, t: "Backup saved." }); setCode("");
          } catch (e) { if ((e as Error).name !== "AbortError") setMsg({ ok: false, t: "Backup failed. Please try again." }); }
          finally { setBusy(false); }
        }}>{busy ? "Encrypting…" : "Export backup"}</button></div>
        {msg && <p className={msg.ok ? "ok" : "err"}>{msg.t}</p>}
      </div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Restore</h2>
        <p className="muted">Replaces everything on this device with the backup.</p>
        <p className="muted">Importing a file disconnects cloud recovery on this device to prevent uploading a different account&apos;s data.</p>
        <Restore onRestored={async (d, c, g) => { if (confirm("Replace all data on this device with this backup? Cloud recovery will be disconnected on this device.")) await onRestore(d, c, g); }} />
      </div>
      {lockPanel}
      </details>
      {data.identity && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Your gamertag</h2>
          <div className="code" data-testid="settings-tag">{I.formatTag(data.identity)}</div>
          <p className="muted">Your display name is included in your encrypted cloud copy. Sign in using the unique gamertag saved in Sign-in &amp; password above.</p>
          <p className="muted">Account ID: <code>{data.identity.id.slice(0, 8)}…</code> (random account identifier)</p>
        </div>
      )}
    </>
  );
}

function Restore({ onRestored }: Readonly<{ onRestored: (d: AppData, code: string, expectedGeneration?: string) => void | Promise<void> }>) {
  const [file, setFile] = useState<File | null>(null); const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <>
      <label>Backup file</label><input type="file" aria-label="Backup file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <label>Recovery code</label><input aria-label="Restore recovery code" value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
      <div className="row-gap"><button className="btn" disabled={!file || !code || busy} onClick={async () => {
        setBusy(true); setErr("");
        try {
          const device = await readDeviceSession();
          if (device?.signedOut) throw new Error("Sign in before restoring accounts.");
          const root = await resolveRecoveryCode(code);
          const d = await C.decryptBackup(JSON.parse(await file!.text()), root);
          if (!isAppData(d)) throw new C.BackupError("The backup's contents aren't valid.");
          await onRestored(M.migrateData(d, today()), root, device?.generation);
        } catch (e) { setErr(e instanceof C.BackupError ? e.message : "That file couldn't be read."); }
        finally { setBusy(false); }
      }}>{busy ? "Decrypting…" : "Restore"}</button></div>
      {err && <p className="err">{err}</p>}
    </>
  );
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
