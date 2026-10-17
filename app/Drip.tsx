"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AppData, Frequency, RateType } from "@/lib/types";
import * as M from "@/lib/maths";
import * as C from "@/lib/crypto";
import { commitCloudRestore, emptyData, getItem, isAppData, loadData, saveData, localVaultStatus } from "@/lib/db";
import * as L from "@/lib/lock";
import * as I from "@/lib/identity";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draft";
import { CloudPanel, CloudReturn, CloudSync } from "./CloudRecovery";
import { PwaStatus } from "./PwaStatus";
import { SignOutButton, SignedOut } from "./DeviceSession";
import { readDeviceSession } from "@/lib/device-session";
import { RecoveryCodes } from "./RecoveryCodes";
import { Trends } from "./Trends";
import { downloadRecoveryCodes, resolveRecoveryCode } from "@/lib/recovery-codes";

type View = { name: "home" } | { name: "detail"; id: string } | { name: "add"; id?: string } | { name: "trends" } | { name: "settings" };
type Verifier = { salt: string; hash: string };

const PROVIDERS: Record<string, string> = {
  Zopa: "#2b2d86", MoneyFarm: "#0f7a6c", Chip: "#1f6feb", Plum: "#6b2bd9", Trading212: "#0c8ce9",
  Vanguard: "#96151d", Marcus: "#1d2f4f", "Premium Bonds": "#3c6e47", Other: "#4a5070",
};
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
  if (gate.signedOut || gate.status === "locked" || gate.status === "migration") return <SignedOut mode={gate.signedOut ? "signedOut" : gate.status === "migration" ? "migration" : "locked"} onSignedIn={refresh} />;
  return <UnlockedDrip />;
}

function UnlockedDrip() {
  const [data, setData] = useState<AppData | null>(null);
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
      const session = await readDeviceSession();
      let loaded = await loadData();
      const t0 = today();
      const accrued = loaded.accounts.map((a) => M.applyDailyAccrual(a, t0));
      if (!session?.signedOut && accrued.some((a, i) => a !== loaded.accounts[i])) { loaded = { ...loaded, accounts: accrued }; await saveData(loaded); }
      const savedVerifier = (await getItem<Verifier>("verifier")) ?? null;
      const latest = await readDeviceSession();
      if (sequence === loadSequence.current && !latest?.signedOut) {
        setData(loaded); setVerifier(savedVerifier);
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

  const update = useCallback(async (fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev ?? emptyData());
      const withSnap = { ...next, snapshots: M.upsertSnapshot(next.snapshots, next.accounts, new Date()) };
      saveData(withSnap).catch(() => setSaveError("Changes could not be saved. Keep Drip open and export a backup before continuing."));
      return withSnap;
    });
  }, []);

  if (loadError) return <main><p role="alert">{loadError}</p></main>;
  if (!data || verifier === undefined) return <main><p className="muted">Loading…</p></main>;
  if (verifier === null) return <Onboarding onDone={async (v, restored, identity, fromCloud = false, expectedGeneration, root) => {
    const d = restored ? fromCloud ? restored : { ...restored, lastBackupAt: new Date().toISOString() } : { ...data, identity };
    if (!fromCloud) await commitCloudRestore(d, undefined, v, expectedGeneration, undefined, root);
    await clearDraft();
    setVerifier(v); setView({ name: "home" }); setData(d);
  }} />;
  if (!data.identity) return <main><h1>Pick your gamertag</h1>
    <p className="muted">Drip now gives you a gamertag. It&apos;s stored on this device only and will become your account name when sync arrives.</p>
    <div className="panel"><HandlePicker onPick={async (identity) => { if (!identity) return; const d = { ...data, identity }; await saveData(d); setData(d); }} cta="Save gamertag" /></div></main>;

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
  if (view.name === "detail") {
    const a = data.accounts.find((x) => x.id === view.id);
    body = a ? <Detail a={a} onBack={() => setView({ name: "home" })} onEdit={() => setView({ name: "add", id: a.id })}
      onLog={(p) => update((d) => ({ ...d, accounts: d.accounts.map((x) => x.id === a.id ? { ...x, payouts: [...x.payouts, p] } : x) }))}
      onChange={(fn) => update((d) => ({ ...d, accounts: d.accounts.map((x) => x.id === a.id ? fn(x) : x) }))}
      onDelete={() => { if (confirm(`Delete ${a.provider}?`)) { update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) })); setView({ name: "home" }); } }} /> : null;
  } else if (view.name === "add") {
    const existing = view.id ? data.accounts.find((x) => x.id === view.id) : undefined;
    body = <AddForm existing={existing} onCancel={() => setView({ name: "home" })} onSave={(a) => {
      update((d) => ({ ...d, accounts: existing ? d.accounts.map((x) => x.id === a.id ? a : x) : [...d.accounts, a] }));
      setView({ name: "detail", id: a.id });
    }} />;
  } else if (view.name === "trends") body = <Trends data={data} onAssumptions={(projection) => update(d => ({ ...d, projection }))} />;
  else if (view.name === "settings") body = <Settings data={data} verifier={verifier}
    onCloudRestored={async (d) => { setVerifier((await getItem<Verifier>("verifier")) ?? null); setData(d); }}
    onLock={(lock) => update((d) => ({ ...d, lock }))}
    onBackedUp={() => update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }))}
    onRestore={async (d, code, expectedGeneration) => { const v = await C.codeVerifier(code); const n = { ...d, lock: undefined, lastBackupAt: new Date().toISOString() }; await commitCloudRestore(n, undefined, v, expectedGeneration, undefined, code); window.dispatchEvent(new Event("drip-cloud-changed")); setVerifier(v); setData(n); }} />;
  else body = <Home data={data} open={(id) => setView({ name: "detail", id })} add={() => setView({ name: "add" })} />;

  return (
    <>
      <main><div className="tagline"><span data-testid="header-tag">💧 Drip · <b>{I.formatTag(data.identity)}</b></span><SignOutButton /></div><PwaStatus /><CloudSync hasData={data.accounts.length > 0} />{saveError && <p role="alert" className="err">{saveError}</p>}{banners}{body}<p className="disclaimer">Drip is for your own tracking. Not financial advice. Figures are estimates before tax.</p></main>
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

function HandlePicker({ onPick, cta, initial = "", onRaw }: { onPick: (i: I.Identity | null) => void; cta?: string; initial?: string; onRaw?: (h: string) => void }) {
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

function Onboarding({ onDone }: { onDone: (v: Verifier, restored?: AppData, identity?: I.Identity, fromCloud?: boolean, expectedGeneration?: string, root?: string) => void | Promise<void> }) {
  const [draft, setDraft] = useState<{ handle: string; code: string } | null>(null);
  const [identity, setIdentity] = useState<I.Identity | null>(null);
  useEffect(() => {
    (async () => {
      const d = (await loadDraft()) ?? { handle: "", code: C.generateRecoveryCode() };
      await saveDraft(d); setDraft(d);
    })();
  }, []);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [mode, setMode] = useState<"new" | "restore">("new");
  if (!draft) return <main><p className="muted">Loading…</p></main>;
  const code = draft.code;
  return (
    <main>
      <h1>Welcome to Drip 💧</h1>
      <PwaStatus />
      <p className="muted">See what your savings and investments earn, and when it lands. Start on this device, then enable encrypted cloud recovery in Backup. No real name or email needed.</p>
      <CloudReturn onRestored={async (d, c) => onDone(await C.codeVerifier(c), d, undefined, true)} />
      {mode === "new" ? (
        <div className="panel">
          <h2>Your gamertag</h2>
          <HandlePicker onPick={setIdentity} initial={draft.handle} onRaw={(h) => saveDraft({ handle: h, code })} />
          <h2>Your recovery code</h2>
          <p className="muted">This code unlocks your encrypted local accounts and backups. Save it in your password manager. Before Start, leaving this page generates a new code. <b>If you lose this code and this device, your data can&apos;t be recovered.</b> Nobody, including us, can reset it.</p>
          <div className="code" data-testid="code">{code}</div>
          <div className="row-gap"><button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button><button className="btn ghost small" onClick={() => downloadRecoveryCodes([code], draft.handle)}>Download recovery code</button></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved my recovery code somewhere safe
          </label>
          <div className="row-gap">
            <button className="btn" disabled={busy || !saved || !identity} onClick={async () => {
              setBusy(true); setError("");
              try { const device = await readDeviceSession(); await onDone(await C.codeVerifier(code), undefined, identity!, false, device?.generation, code); }
              catch { setError("Could not encrypt local accounts. Your recovery code has not changed; try again."); }
              finally { setBusy(false); }
            }}>{busy ? "Encrypting…" : "Start"}</button>
            <button className="btn ghost" onClick={() => setMode("restore")}>Restore a backup</button>
          </div>
          {error && <p role="alert" className="err">{error}</p>}
        </div>
      ) : (
        <div className="panel"><h2>Restore a backup</h2>
          <Restore onRestored={async (d, c, g) => onDone(await C.codeVerifier(c), d, undefined, false, g, c)} />
          <div className="row-gap"><button className="btn ghost" onClick={() => setMode("new")}>Back</button></div>
        </div>
      )}
    </main>
  );
}

function Home({ data, open, add }: { data: AppData; open: (id: string) => void; add: () => void }) {
  const t = today();
  const up = M.upcoming(data.accounts, t);
  return (
    <>
      <p className="muted">Total balance</p>
      <div className="big">{M.gbp(M.totalBalance(data.accounts))}</div>
      <p className="muted">≈ {M.gbp(M.totalMonthlyIncome(data.accounts))} a month · {M.weightedYield(data.accounts).toFixed(2)}% average</p>
      {data.accounts.length === 0 ? (
        <div className="panel"><p>No accounts yet. Add your first savings or investment account to see what it earns.</p><button className="btn" onClick={add}>Add account</button></div>
      ) : (
        <div className="stack">
          {data.accounts.map((a) => {
            const next = M.nextPayout(a.nextPayoutDate, a.frequency, t);
            return (
              <button key={a.id} className="card" onClick={() => open(a.id)}>
                <div className="row"><span className="prov">{a.provider}</span><span className="bal">{M.gbp(a.balance)}</span></div>
                <div className="row meta"><span>{a.label || a.rateType}</span><span>{a.ratePct}%</span></div>
                <div className="meta" style={{ marginTop: 18 }}>≈ {M.gbp(M.monthlyIncome(a.balance, a.ratePct))} this month · {a.frequency === "daily" ? "Daily interest" : `paid ${fmtDate(next)}`}</div>
              </button>
            );
          })}
        </div>
      )}
      {up.length > 0 && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Upcoming payouts</h2>
          <ul className="list">{up.map((p) => <li key={p.account.id}><span>{p.account.provider}<br /><span className="muted">{fmtDate(p.date)}</span></span><b>{M.gbp(p.amount)}</b></li>)}</ul>
        </div>
      )}
    </>
  );
}

function Detail({ a, onBack, onEdit, onDelete, onLog, onChange }: { a: Account; onBack: () => void; onEdit: () => void; onDelete: () => void; onLog: (p: Account["payouts"][number]) => void; onChange: (fn: (x: Account) => Account) => void }) {
  const [amt, setAmt] = useState(""); const [date, setDate] = useState(today());
  const [mode, setMode] = useState<"topup" | "withdraw" | "set" | null>(null); const [verr, setVerr] = useState(""); const [val, setVal] = useState(""); const [vdate, setVdate] = useState(today());
  const [by, setBy] = useState<"week" | "month">("week");
  const interest = M.interestHistory(a.events, by);
  const events = [...(a.events ?? [])].filter((e) => e.type !== "interest").sort((x, y) => y.date.localeCompare(x.date));
  const next = M.nextPayout(a.nextPayoutDate, a.frequency, today());
  const history = [...a.payouts].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      <button className="btn ghost small" onClick={onBack}>← Accounts</button>
      <div className="card" style={{ marginTop: 12, cursor: "default" }}>
        <div className="row"><span className="prov">{a.provider}</span><span>{a.rateType}</span></div>
        {a.label && <div className="meta">{a.label}</div>}
        <div className="bal">{M.gbp(a.balance)}</div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="muted">Rate</div><div className="v">{a.ratePct}%</div></div>
        <div className="stat"><div className="muted">Per month</div><div className="v">{M.gbp(M.monthlyIncome(a.balance, a.ratePct))}</div></div>
        <div className="stat"><div className="muted">Next payout</div><div className="v">{a.frequency === "daily" ? "Daily interest" : fmtDate(next)}</div></div>
        <div className="stat"><div className="muted">{a.frequency === "daily" ? "Per day (est.)" : `Expected (${a.frequency})`}</div><div className="v">{M.gbp(M.payoutAmount(a))}</div></div>
      </div>
      <div className="row-gap">
        <button className="btn" onClick={() => { setMode("topup"); setVal(""); }}>Top up</button>
        <button className="btn ghost" onClick={() => { setMode("withdraw"); setVal(""); setVerr(""); }}>Withdraw</button>
        <button className="btn ghost" onClick={() => { setMode("set"); setVal(String(a.balance)); }}>Update balance</button>
      </div>
      {mode && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>{{ topup: "Top up", withdraw: "Withdraw", set: "Update balance" }[mode]}</h2>
          <p className="muted">{{ topup: "Adds money on this date. Interest before it uses the old balance; after it, growth continues from the new amount.",
            withdraw: "Takes money out on this date. Interest after it is worked out on the smaller balance. Withdrawals aren't counted as negative growth.",
            set: "Set the balance shown in your provider's app. This isn't counted as a deposit or withdrawal." }[mode]}</p>
          <div className="grid"><input inputMode="decimal" placeholder={mode === "set" ? "New balance £" : "Amount £"} aria-label="amount" value={val} onChange={(e) => setVal(e.target.value)} /><input type="date" aria-label="date" value={vdate} onChange={(e) => setVdate(e.target.value)} /></div>
          <div className="row-gap">
            <button className="btn small" disabled={mode === "set" ? !(val !== "" && Number(val) >= 0) : !(Number(val) > 0)} onClick={() => {
              const n = Number(val);
              if (mode === "withdraw" && n > a.balance) { setVerr("You can't withdraw more than the balance."); return; }
              onChange((x) => mode === "topup" ? M.applyTopUp(x, n, vdate) : mode === "withdraw" ? M.applyWithdraw(x, n, vdate) : M.applySetBalance(x, n, vdate)); setMode(null);
            }}>Save</button>
            <button className="btn ghost small" onClick={() => setMode(null)}>Cancel</button>
          </div>
          {verr && <p className="err">{verr}</p>}
        </div>
      )}
      {events.length > 0 && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Top-ups, withdrawals and updates</h2>
          <ul className="list" data-testid="events">{events.map((e, i) => <li key={i}><span>{{ topup: "Top up", withdraw: "Withdrawal", set: "Balance set", interest: "Interest" }[e.type]}<br /><span className="muted">{fmtDate(e.date)}</span></span><b className={e.type === "topup" ? "ok" : e.type === "withdraw" ? "err" : ""}>{e.type === "topup" ? "+" : e.type === "withdraw" ? "−" : ""}{M.gbp(e.amount)}</b></li>)}</ul>
        </div>
      )}
      {a.frequency === "daily" && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Interest earned (estimated)</h2>
          <p className="muted">Worked out daily from your balance and rate and added to the balance. Your provider&apos;s figures may differ slightly.</p>
          <div className="row-gap" style={{ marginTop: 0 }}>
            <button className={`btn small ${by === "week" ? "" : "ghost"}`} onClick={() => setBy("week")}>By week</button>
            <button className={`btn small ${by === "month" ? "" : "ghost"}`} onClick={() => setBy("month")}>By month</button>
          </div>
          {interest.length === 0 ? <p className="muted">Interest shows here from tomorrow.</p> :
            <ul className="list" data-testid="interest-history">{interest.map((r) => <li key={r.period}><span>{by === "week" ? `Week of ${fmtDate(r.period)}` : new Date(r.period + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span><b className="ok">+{M.gbp(r.amount)}</b></li>)}</ul>}
        </div>
      )}
      {(a.rateHistory?.length ?? 0) > 1 && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>Rate history</h2>
          <ul className="list">{[...a.rateHistory!].reverse().map((r) => <li key={r.from}><span>{r.from === "0000-01-01" ? "Since added" : `From ${fmtDate(r.from)} ${r.from.slice(0, 4)}`}</span><b>{r.ratePct}%</b></li>)}</ul>
        </div>
      )}
      <div className="panel"><h2 style={{ marginTop: 0 }}>Payout history</h2>
        {history.length === 0 ? <p className="muted">No payouts logged yet.</p> :
          <ul className="list">{history.map((p, i) => {
            const diff = p.amount - M.payoutAmount(a);
            return <li key={i}><span>{fmtDate(p.date)}<br /><span className="muted">expected {M.gbp(M.payoutAmount(a))}</span></span>
              <span style={{ textAlign: "right" }}><b>{M.gbp(p.amount)}</b><br /><span className={diff >= 0 ? "ok" : "err"}>{diff >= 0 ? "+" : ""}{M.gbp(diff)}</span></span></li>;
          })}</ul>}
        <label>Log an actual payout</label>
        <div className="grid"><input inputMode="decimal" aria-label="Payout amount" placeholder="Amount £" value={amt} onChange={(e) => setAmt(e.target.value)} /><input type="date" aria-label="Payout date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="row-gap"><button className="btn small" disabled={!(Number(amt) > 0)} onClick={() => { onLog({ date, amount: Number(amt), kind: "actual" }); setAmt(""); }}>Log payout</button></div>
      </div>
      <div className="row-gap"><button className="btn ghost" onClick={onEdit}>Edit</button><button className="btn danger" onClick={onDelete}>Delete</button></div>
    </>
  );
}

function AddForm({ existing, onSave, onCancel }: { existing?: Account; onSave: (a: Account) => void; onCancel: () => void }) {
  const [provider, setProvider] = useState(existing?.provider ?? "Zopa");
  const [custom, setCustom] = useState(existing && !(existing.provider in PROVIDERS) ? existing.provider : "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [balance, setBalance] = useState(existing ? String(existing.balance) : "");
  const [rate, setRate] = useState(existing ? String(existing.ratePct) : "");
  const [rateType, setRateType] = useState<RateType>(existing?.rateType ?? "interest");
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "monthly");
  const [next, setNext] = useState(existing?.nextPayoutDate ?? M.addMonths(today(), 1));
  const [rateFrom, setRateFrom] = useState(today());
  const isOther = provider === "Other" || (existing && !(existing.provider in PROVIDERS) && provider === existing.provider);
  const b = Number(balance), r = Number(rate);
  const valid = b >= 0 && balance !== "" && r >= 0 && r < 100 && rate !== "" && (frequency === "daily" || /^\d{4}-\d{2}-\d{2}$/.test(next)) && (!isOther || custom.trim());
  return (
    <>
      <h1>{existing ? "Edit account" : "Add account"}</h1>
      <label>Provider</label>
      <select aria-label="Provider" value={isOther ? "Other" : provider} onChange={(e) => setProvider(e.target.value)}>{Object.keys(PROVIDERS).map((p) => <option key={p}>{p}</option>)}</select>
      {isOther && <><label>Provider name</label><input aria-label="Provider name" value={custom} onChange={(e) => setCustom(e.target.value)} /></>}
      <label>Nickname (optional, stays on this device)</label><input aria-label="Nickname" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rainy day pot" />
      <div className="grid">
        <div><label>Balance £</label><input inputMode="decimal" aria-label="Balance" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="3000" /></div>
        <div><label>Rate % a year</label><input inputMode="decimal" aria-label="Rate" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7" /></div>
        <div><label>Type</label><select aria-label="Type" value={rateType} onChange={(e) => setRateType(e.target.value as RateType)}><option value="interest">Interest</option><option value="dividend">Dividend</option></select></div>
        <div><label>Paid</label><select aria-label="Paid" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}><option value="daily">Daily interest</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Yearly</option></select></div>
      </div>
      {existing && rate !== "" && Number(rate) !== existing.ratePct && (<><label>New rate applies from</label><input type="date" aria-label="New rate applies from" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} /></>)}
      {frequency !== "daily" ? <><label>Next payout date</label><input type="date" aria-label="Next payout date" value={next} onChange={(e) => setNext(e.target.value)} /></>
        : <p className="muted">Interest is added to the balance every day, so there&apos;s no payout date.</p>}
      {valid && <p className="muted">≈ {M.gbp(M.monthlyIncome(b, r))} a month</p>}
      <div className="row-gap">
        <button className="btn" disabled={!valid} onClick={() => {
          const name = isOther ? custom.trim() : provider;
          const createdAt = existing?.createdAt ?? new Date().toISOString();
          const base: Account = { ...(existing ?? {}), id: existing?.id ?? crypto.randomUUID(), provider: name, label: label.trim(), balance: M.round2(b), ratePct: existing?.ratePct ?? r, rateType, frequency,
            nextPayoutDate: frequency === "daily" ? today() : next, accruedThrough: frequency === "daily" ? (existing?.accruedThrough ?? today()) : undefined, colour: PROVIDERS[name] ?? PROVIDERS.Other, payouts: existing?.payouts ?? [], events: existing?.events ?? [], createdAt,
            rateHistory: existing?.rateHistory ?? [{ from: createdAt.slice(0, 10), ratePct: r }] };
          onSave(existing && r !== existing.ratePct ? M.applyRateChange(base, r, rateFrom, today()) : base);
        }}>Save</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

function LockScreen({ credentialId, verifier, onUnlock }: { credentialId: string; verifier: Verifier; onUnlock: () => void }) {
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

function Settings({ data, verifier, onBackedUp, onRestore, onLock, onCloudRestored }: { data: AppData; verifier: Verifier; onBackedUp: () => void; onRestore: (d: AppData, code: string, expectedGeneration?: string) => void | Promise<void>; onLock: (l: AppData["lock"]) => void; onCloudRestored: (d: AppData, code: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null); const [lockMsg, setLockMsg] = useState("");
  useEffect(() => { L.passkeySupported().then(setSupported); }, []);
  const lockPanel = (
    <div className="panel"><h2 style={{ marginTop: 0 }}>App lock</h2>
      <p className="muted">Ask for Face ID (or your device passkey) when Drip opens and after 5 minutes in the background. Your recovery code also unlocks it.</p>
      <p className="muted"><b>Be aware:</b> this is a screen lock only. It stops someone casually opening Drip on your phone, Local accounts are encrypted separately and need your recovery code after a full reload. This extra screen lock does not unwrap the encryption key.</p>
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
      <RecoveryCodes data={data} verifier={verifier} />
      <CloudPanel data={data} verifier={verifier} onRestored={onCloudRestored} />
      <details className="panel"><summary>Advanced: file backups &amp; app lock</summary>
      <p className="muted">Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("en-GB") : "never"}</p>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Export</h2>
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
          <p className="muted">Your display name is included in your encrypted cloud copy. It does not need to be unique and cannot be used to sign in or recover your data.</p>
          <p className="muted">Account ID: <code>{data.identity.id.slice(0, 8)}…</code> (random account identifier)</p>
        </div>
      )}
    </>
  );
}

function Restore({ onRestored }: { onRestored: (d: AppData, code: string, expectedGeneration?: string) => void | Promise<void> }) {
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
