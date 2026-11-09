"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData, ProductCategory } from "@/lib/types";
import * as M from "@/lib/maths";
import * as C from "@/lib/crypto";
import { commitCloudRestore, getItem, isAppData, loadData, mutateData, localVaultStatus, passwordUnlockContext } from "@/lib/db";
import * as L from "@/lib/lock";
import * as I from "@/lib/identity";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draft";
import { CloudPanel, CloudReturn, CloudSync } from "./CloudRecovery";
import { PwaStatus } from "./PwaStatus";
import { InstallTask, useInstallTask } from "./InstallTask";
import { SignOutButton, SignedOut } from "./DeviceSession";
import { readDeviceSession } from "@/lib/device-session";
import { RecoveryCodes } from "./RecoveryCodes";
import { SignupRecovery } from "./SignupRecovery";
import { PasskeyUnlock } from "./PasskeyUnlock";
import { PasswordSetup } from "./PasswordSetup";
import { PasswordSignIn } from "./PasswordSignIn";
import { AuthLayout, useAuthScreen } from "./AuthScreen";
import { signUpPassword } from "@/lib/password-login";
import { SignupForm } from "./SignupForm";
import { RecoveryTask } from "./RecoveryTask";
import { Trends } from "./Trends";
import { AccountForm } from "./AccountForm";
import { DeviceSettings } from "./DeviceManagement";
import { AccountDetail } from "./AccountDetail";
import { CreditCardForm } from "./CreditCardForm";
import { AccountChooser } from "./AccountChooser";
import { AccountsHome } from "./accounts/AccountsHome";
import { AppAccountHeader } from "./accounts/AppAccountHeader";
import { ProfileSettings } from "./accounts/ProfileSettings";
import { accountTitle } from "./accounts/presentation";
import { accountAssets, isCreditAccount, portfolioTotals } from "@/lib/credit-card";
import { readIncomePeriod, saveIncomePeriod, type IncomePeriod } from "@/lib/profile-preferences";
import { resolveRecoveryCode } from "@/lib/recovery-codes";
import { DividendPortfolio } from "./DividendPortfolio";
import { PaymentNotifications } from "./PaymentNotifications";
import { PhoneReminderSync } from "./PhoneReminders";
import { useCalendarDay } from "./useCalendarDay";
import { paymentReminders, debtPaymentReminders } from "@/lib/payment-reminders";
import { activeAccounts, archiveAccount, isArchivedAccount, restoreAccount } from "@/lib/account-lifecycle";
import { ArchivedAccounts } from "./ArchivedAccounts";
import { DraftGuardContext, useDraftGuardState } from "./useDraftGuard";
import { Feedback } from "./Feedback";

type View = { name: "home" } | { name: "choose" } | { name: "detail"; id: string } | { name: "add"; id?: string; category?: ProductCategory } | { name: "trends" } | { name: "settings" } | { name: "portfolio" } | { name: "payments" } | { name: "archived" } | { name: "feedback" };
type Verifier = { salt: string; hash: string };

const today = () => M.ymd(new Date());

export default function Drip() {
  const installTask = useInstallTask();
  const [gate, setGate] = useState<{ status: Awaited<ReturnType<typeof localVaultStatus>>; signedOut: boolean; signupRecovery: boolean }>();
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const status = await localVaultStatus(); const session = await readDeviceSession();
      const checkpoint = await getItem<{ vaultId: string }>("signupRecoveryRequired");
      const { binding } = await passwordUnlockContext();
      if (id !== sequence.current) return;
      if (status === "unlocked" && !session?.signedOut && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setGate({ status, signedOut: !!session?.signedOut, signupRecovery: !!checkpoint && checkpoint.vaultId === binding?.vaultId }); setError("");
    } catch { if (id === sequence.current) setError("Could not open local storage. Your stored copy has not been changed. Try again."); }
  }, []);
  useEffect(() => {
    const open = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== navigator.serviceWorker?.controller || event.data?.type !== "DRIP_OPEN_PAYMENTS") return;
      const url = new URL(location.href); url.searchParams.set("tab", "payments");
      history.replaceState(null, "", url.href);
      window.dispatchEvent(new Event("drip-open-payments"));
    };
    navigator.serviceWorker?.addEventListener("message", open);
    return () => navigator.serviceWorker?.removeEventListener("message", open);
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
  if (gate.signupRecovery) return <SignupRecovery onSaved={refresh} />;
  return <UnlockedDrip installTask={installTask} />;
}

function UnlockedDrip({ installTask }: Readonly<{ installTask: ReturnType<typeof useInstallTask> }>) {
  const [data, setData] = useState<AppData | null>(null);
  const latestData = useRef<AppData | null>(null);
  const dataGeneration = useRef(0);
  const edits = useRef<Promise<unknown>>(Promise.resolve());
  const [pendingSaves, setPendingSaves] = useState(0);
  const replaceData = useCallback((next: AppData) => { dataGeneration.current++; latestData.current = next; setData(next); }, []);
  const [verifier, setVerifier] = useState<Verifier | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: "home" });
  const draftGuard = useDraftGuardState();
  const navigate = useCallback((nextView: View) => {
    if (JSON.stringify(nextView) === JSON.stringify(view)) return;
    if (draftGuard.leave()) setView(nextView);
  }, [view, draftGuard.leave]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileButton = useRef<HTMLButtonElement>(null);
  const [incomePeriod, setIncomePeriod] = useState<IncomePeriod>("month");
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const preferenceSequence = useRef(0);
  const preferenceWrites = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const owner = data?.identity?.id;
    const sequence = ++preferenceSequence.current;
    setProfileOpen(false); setIncomePeriod("month"); setPreferenceBusy(false); setPreferenceStatus(""); setPreferenceError("");
    if (!owner) return;
    void readIncomePeriod(owner).then(period => { if (sequence === preferenceSequence.current) setIncomePeriod(period); }).catch(() => { if (sequence === preferenceSequence.current) setPreferenceError("Could not read your display preference. Monthly view is available; retry your choice."); });
    return () => { preferenceSequence.current++; };
  }, [data?.identity?.id]);
  const calendarDay = useCalendarDay();
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const initialNavigation = useRef(false);
  const loadSequence = useRef(0);
  const [locked, setLocked] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const lockOn = !!data?.lock?.credentialId;
  useEffect(() => {
    if (!data || initialNavigation.current) return;
    initialNavigation.current = true;
    if (data.accounts.length && new URLSearchParams(location.search).get("tab") === "payments") setView({ name: "payments" });
  }, [data]);
  useEffect(() => {
    const open = () => {
      if (["add", "detail", "settings"].includes(view.name) || pendingSaves || draftGuard.dirty) { setPaymentPrompt(true); return; }
      setView({ name: "payments" }); setPaymentPrompt(false);
    };
    window.addEventListener("drip-open-payments", open);
    return () => window.removeEventListener("drip-open-payments", open);
  }, [view.name, pendingSaves, draftGuard.dirty]);
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
    return () => { loadSequence.current++; };
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
        const at = new Date();
        const committed = await mutateData(current => {
          if (generation !== dataGeneration.current) throw new Error("The active account changed.");
          const next = fn(current);
          return { ...next, snapshots: M.upsertSnapshot(next.snapshots, next.accounts, at) };
        });
        if (generation !== dataGeneration.current) return false;
        latestData.current = committed; setData(committed); setSaveError("");
        return true;
      } catch (error) {
        setSaveError(error instanceof Error && error.name === "StaleAccountEdit" ? "This account changed in another tab. Reload Drip before saving again; your entry has not overwritten it." : "Changes could not be saved. Your saved data is unchanged; retry the action.");
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
    if (password && identity) await signUpPassword(identity.handle, password, d);
    else if (!fromCloud) {
      if (!v) throw new Error("Could not verify the restored account.");
      await commitCloudRestore(d, undefined, v, expectedGeneration, undefined, root);
    }
    await clearDraft();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const savedVerifier = await getItem<Verifier>("verifier");
    if (!savedVerifier) throw new Error("Could not open your account. Sign in again.");
    setVerifier(savedVerifier); setView({ name: "home" }); replaceData(d);
  }} />;
  if (!data.identity) return <main><h1>Pick your gamertag</h1>
    <p className="muted">Choose a display gamertag for your existing accounts. This label does not create password sign-in. You can add a sign-in gamertag and password later in Settings → Sign-in &amp; password.</p>
    <div className="panel"><HandlePicker onPick={async (identity) => {
      if (!identity) return;
      await update(current => {
        if (current.identity) throw Object.assign(new Error("Profile changed"), { name: "StaleAccountEdit" });
        return { ...current, identity };
      });
    }} cta="Save gamertag" /></div>{saveError ? <p role="alert" className="err">{saveError}</p> : null}</main>;

  if (locked && data.lock?.credentialId) return <LockScreen credentialId={data.lock.credentialId} verifier={verifier} onUnlock={() => setLocked(false)} />;

  const active = activeAccounts(data.accounts);
  const archived = data.accounts.filter(isArchivedAccount);
  const pendingPayments = paymentReminders(active, calendarDay).filter(item => item.date === calendarDay && !item.logged).length + debtPaymentReminders(active, calendarDay).filter(item => item.date <= calendarDay).length;
  const ownerId = data.identity.id;
  const assets = accountAssets(data.accounts);
  const creditPlans = active.filter(isCreditAccount).map(account => ({ accountId: account.id, name: accountTitle(account), apr: account.creditCard!.apr, minimumPayment: account.creditCard!.minimumPayment, plannedPayment: account.creditCard!.plannedPayment, paymentDate: account.nextPayoutDate }));
  const counts = { cash: assets.filter(account => account.rateType !== "dividend").length, stocks: assets.filter(account => account.rateType === "dividend").length, credits: creditPlans.length };
  const next = M.upcoming(assets, calendarDay)[0];
  const nextPayment = next ? { accountId: next.account.id, name: accountTitle(next.account), date: next.date, amount: next.amount } : null;
  function closeProfile() { setProfileOpen(false); requestAnimationFrame(() => profileButton.current?.focus()); }
  function profileNavigate(nextView: View) { if (draftGuard.leave()) { setProfileOpen(false); setView(nextView); } }
  async function changePeriod(period: IncomePeriod) {
    const sequence = ++preferenceSequence.current;
    setPreferenceBusy(true); setPreferenceError(""); setPreferenceStatus("");
    const operation = preferenceWrites.current.then(() => saveIncomePeriod(ownerId, period));
    preferenceWrites.current = operation.catch(() => {});
    try {
      await operation;
      if (sequence === preferenceSequence.current) { setIncomePeriod(period); setPreferenceStatus("Preference saved on this device."); }
    } catch { if (sequence === preferenceSequence.current) setPreferenceError("Could not save your display preference. Your previous view is kept; retry."); }
    finally { if (sequence === preferenceSequence.current) setPreferenceBusy(false); }
  }
  const accountsCanvas = <AccountsHome accounts={active} identity={data.identity} totals={portfolioTotals(data.accounts)} creditPlans={creditPlans} incomePeriod={incomePeriod} onIncomePeriod={changePeriod} preferenceBusy={preferenceBusy} receivedThisMonth={M.recordedIncome(data.accounts, calendarDay.slice(0, 7), calendarDay)} nextPayment={nextPayment} estimatedValues={assets.some(account => !!account.marketValuation)} onAdd={() => navigate({ name: "choose" })} onOpen={id => navigate({ name: "detail", id })} onPortfolio={() => navigate({ name: "portfolio" })} />;
  let body: React.ReactNode;
  switch (view.name) {
  case "detail": {
    const a = active.find((x) => x.id === view.id);
    body = a ? <AccountDetail key={a.id} a={a} onBack={() => navigate({ name: "home" })} onEdit={() => navigate({ name: "add", id: a.id })}
      onChange={(fn) => update((d) => {
        if (!d.accounts.some(account => account.id === a.id)) throw new Error("This account was removed. Return to Accounts.");
        return { ...d, accounts: d.accounts.map((x) => x.id === a.id ? fn(x) : x) };
      })}
      onArchive={async () => {
        if (!draftGuard.leave() || !confirm(`Archive ${accountTitle(a)}? It will leave your current balances, predictions and reminders. Recorded payments are kept.`)) return true;
        const saved = await update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? archiveAccount(x) : x) }));
        if (saved) setView({ name: "home" });
        return saved;
      }}
      onDelete={async () => {
        if (!draftGuard.leave() || !confirm(`Permanently delete ${accountTitle(a)} and its recorded income history? This cannot be undone. Archive the account instead to keep its history.`)) return true;
        const saved = await update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) }));
        if (saved) setView({ name: "home" });
        return saved;
      }} /> : <><p role="status">This account is no longer in your saved list.</p><button className="btn" onClick={() => setView({ name: "home" })}>Back to Accounts</button></>;
    break;
  }
  case "add": {
    const existing = view.id ? data.accounts.find((x) => x.id === view.id) : undefined;
    const Form = view.category === "credit-card" || (existing && isCreditAccount(existing)) ? CreditCardForm : AccountForm;
    body = <Form key={view.id ?? view.category ?? "new"} existing={existing} initialCategory={view.category} onCancel={() => { draftGuard.reset(); setView({ name: "home" }); }} onSave={async (a) => {
      const saved = await update((d) => {
        if (existing && !d.accounts.some(account => account.id === existing.id)) throw new Error("This account was removed. Return to Accounts.");
        if (existing && JSON.stringify(d.accounts.find(account => account.id === existing.id)) !== JSON.stringify(existing)) throw Object.assign(new Error("Stale account edit"), { name: "StaleAccountEdit" });
        return { ...d, accounts: d.accounts.some(x => x.id === a.id) ? d.accounts.map((x) => x.id === a.id ? a : x) : [...d.accounts, a] };
      });
      if (saved) { draftGuard.reset(); setView({ name: "detail", id: a.id }); }
      return saved;
    }} />;
    break;
  }
  case "trends":
    body = <Trends data={data} onAssumptions={(projection) => update(d => ({ ...d, projection }))} />;
    break;
  case "portfolio":
    body = <DividendPortfolio accounts={data.accounts.filter(account => !isCreditAccount(account))} onOpen={id => navigate({ name: "detail", id })} onAdd={() => navigate({ name: "add", category: "stocks-funds" })} />;
    break;
  case "payments":
    body = <PaymentNotifications accounts={data.accounts} identityId={data.identity.id} onOpen={id => navigate({ name: "detail", id })} />;
    break;
  case "feedback":
    body = <Feedback onBack={() => navigate({ name: "home" })} />;
    break;
  case "archived":
    body = <ArchivedAccounts accounts={archived} onBack={() => navigate({ name: "settings" })}
      onRestore={id => update(d => ({ ...d, accounts: d.accounts.map(account => account.id === id ? restoreAccount(account) : account) }))}
      onDelete={async id => {
        const account = data.accounts.find(value => value.id === id);
        if (!account || !confirm(`Permanently delete ${accountTitle(account)} and all its recorded income? This cannot be undone.`)) return true;
        return update(d => ({ ...d, accounts: d.accounts.filter(value => value.id !== id) }));
      }} />;
    break;
  case "settings":
    body = <><button className="btn ghost" onClick={() => navigate({ name: "archived" })}>Archived accounts ({archived.length})</button><Settings data={data} verifier={verifier}
    onNotifications={() => navigate({ name: "payments" })}
    onCloudRestored={async (d) => { setVerifier((await getItem<Verifier>("verifier")) ?? null); replaceData(d); }}
    onLock={(lock) => update((d) => ({ ...d, lock }))}
    onBackedUp={() => update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }))}
    onRestore={async (d, code, expectedGeneration) => { const v = await C.codeVerifier(code); const n = { ...d, lock: undefined, lastBackupAt: new Date().toISOString() }; await commitCloudRestore(n, undefined, v, expectedGeneration, undefined, code); window.dispatchEvent(new Event("drip-cloud-changed")); setVerifier(v); replaceData(n); }} /></>;
    break;
  case "choose":
    body = <>{accountsCanvas}<AccountChooser onClose={() => navigate({ name: "home" })} onChoose={category => navigate({ name: "add", category })} /></>;
    break;
  default:
    body = accountsCanvas;
  }

  return (
    <DraftGuardContext.Provider value={draftGuard}>
      <main className={view.name === "home" || view.name === "choose" ? "accounts-page" : undefined}>
        <AppAccountHeader identity={data.identity} pendingPayments={pendingPayments} onProfile={() => setProfileOpen(true)} onPayments={() => navigate({ name: "payments" })} profileButtonRef={profileButton} profileOpen={profileOpen} />
        <output className="muted" hidden={!!saveError} data-testid="local-save-status">{pendingSaves ? "Saving changes…" : draftGuard.dirty ? "Unsaved changes." : "Saved on this device."}</output>
        <PwaStatus allowReload={!draftGuard.dirty && !pendingSaves && !preferenceBusy && (view.name === "home" || view.name === "portfolio")} />
        <CloudSync hasData={data.accounts.length > 0} /><PhoneReminderSync identityId={data.identity.id} accounts={active} onManage={() => navigate({ name: "payments" })} />
        {saveError ? <p role="alert" className="err">{saveError}</p> : null}
        {paymentPrompt ? <div className="banner info"><span>Payment reminder selected. Finish your current edit before opening reminders.</span><button className="btn ghost small" disabled={!!pendingSaves} onClick={() => { setPaymentPrompt(false); navigate({ name: "payments" }); }}>Open reminders</button></div> : null}
        <InstallTask state={installTask} />{view.name === "home" ? <RecoveryTask onSetup={() => navigate({ name: "settings" })} /> : null}
        {body}<p className="disclaimer">Drip is for your own tracking. Not financial advice. Figures are estimates before tax.</p>
      </main>
      <ProfileSettings key={data.identity.id} open={profileOpen} identity={data.identity} counts={counts} incomePeriod={incomePeriod} onIncomePeriod={changePeriod} preferenceBusy={preferenceBusy} preferenceStatus={preferenceStatus} preferenceError={preferenceError} onClose={closeProfile} onAccounts={() => profileNavigate({ name: "home" })} onSettings={() => profileNavigate({ name: "settings" })} onPayments={() => profileNavigate({ name: "payments" })} onFeedback={() => profileNavigate({ name: "feedback" })} signOut={<SignOutButton disabled={!!pendingSaves || preferenceBusy || draftGuard.dirty} />} />
      <nav className="tabs">
        {(["home", "portfolio", "trends", "add", "settings"] as const).map((n) => (
          <button key={n} className={view.name === n || (n === "home" && view.name === "detail") || (n === "add" && view.name === "choose") ? "on" : ""} onClick={() => navigate({ name: n === "add" ? "choose" : n } as View)}>
            {{ home: "Accounts", portfolio: "Portfolio", trends: "Trends", add: "Add", settings: "Settings" }[n]}
          </button>
        ))}
      </nav>
    </DraftGuardContext.Provider>
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

function Onboarding({ onDone }: Readonly<{ onDone: (v: Verifier | undefined, restored?: AppData, identity?: I.Identity, fromCloud?: boolean, expectedGeneration?: string, root?: string, password?: string) => void | Promise<void> }>) {
  const [draft, setDraft] = useState<{ handle: string } | null>(null);
  const [draftAttempt, setDraftAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const d = (await loadDraft()) ?? { handle: "" };
      await saveDraft(d); if (active) setDraft(d);
    })().catch(() => { if (active) setError("Could not prepare signup on this device. Try again."); });
    return () => { active = false; };
  }, [draftAttempt]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { screen, navigate } = useAuthScreen();
  useEffect(() => { setError(""); }, [screen]);
  if (!draft) return <main>{error ? <><p role="alert">{error}</p><button className="btn" onClick={() => { setError(""); setDraftAttempt(n => n + 1); }}>Try again</button></> : <p className="muted">Loading…</p>}</main>;
  const screenCopy = {
    login: { title: "Sign in to Drip", description: "Use your gamertag and password to open your accounts." },
    signup: { title: "Create your account", description: "Track your money and the income it earns. No real name, email or phone needed." },
    recover: { title: "Recover your account", description: "Find your saved credentials or use a recovery code to get back in." },
    backup: { title: "Restore a backup", description: "Get back to your accounts using a saved recovery code." },
  }[screen];
  return (
    <AuthLayout title={screenCopy.title} description={screenCopy.description} welcome={screen === "login" || screen === "signup"}>
      <PwaStatus />
      {screen === "login" && <>
      <PasswordSignIn showTitle={false} disabled={busy} onBusyChange={setBusy} onSignedIn={async () => {
        const restored = await loadData(); const v = await getItem<Verifier>("verifier");
        if (!v) throw new Error("Sign-in could not be completed. Try again.");
        await onDone(v, restored, undefined, true);
      }} />
      <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("recover")}>Forgot password?</button></div>
      <div className="auth-footer"><p>New to Drip?</p><button className="btn ghost" disabled={busy} onClick={() => navigate("signup")}>Sign up</button></div>
      </>}
      {screen === "recover" && <>
        <CloudReturn onRestored={async (d, c) => onDone(await C.codeVerifier(c), d, undefined, true)} />
        <div className="auth-links"><button className="text-link" disabled={busy} onClick={() => navigate("backup")}>Restore a backup</button></div>
      </>}
      {screen === "signup" && (
        <SignupForm initialHandle={draft.handle} onHandleChange={h => { void saveDraft({ handle: h }); }} onBusyChange={setBusy}
          onCreate={async (identity, password) => { await onDone(undefined, undefined, identity, false, undefined, undefined, password); }} />
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

function Settings({ data, verifier, onBackedUp, onRestore, onLock, onCloudRestored, onNotifications }: Readonly<{ data: AppData; verifier: Verifier; onBackedUp: () => void; onRestore: (d: AppData, code: string, expectedGeneration?: string) => void | Promise<void>; onLock: (l: AppData["lock"]) => void; onCloudRestored: (d: AppData, code: string) => void | Promise<void>; onNotifications: () => void }>) {
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
      <h1>Settings</h1>
      <section className="panel"><h2>Payment notifications</h2><p className="muted">Expected payment dates and optional phone reminders for your income accounts.</p><button className="btn ghost" onClick={onNotifications}>Manage payment notifications</button></section>
      <p className="muted">Keep your recovery codes safe. They restore your latest synced cloud copy if you change devices or your browser is cleared.</p>
      <PasswordSetup data={data} />
      <DeviceSettings key={data.identity?.id} />
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
