"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, AppData, Frequency, RateType } from "@/lib/types";
import * as M from "@/lib/maths";
import * as C from "@/lib/crypto";
import { emptyData, getItem, isAppData, loadData, saveData, setItem } from "@/lib/db";

type View = { name: "home" } | { name: "detail"; id: string } | { name: "add"; id?: string } | { name: "trends" } | { name: "settings" };
type Verifier = { salt: string; hash: string };

const PROVIDERS: Record<string, string> = {
  Zopa: "#2b2d86", MoneyFarm: "#0f7a6c", Chip: "#1f6feb", Plum: "#6b2bd9", Trading212: "#0c8ce9",
  Vanguard: "#96151d", Marcus: "#1d2f4f", "Premium Bonds": "#3c6e47", Other: "#4a5070",
};
const today = () => M.ymd(new Date());

export default function Drip() {
  const [data, setData] = useState<AppData | null>(null);
  const [verifier, setVerifier] = useState<Verifier | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: "home" });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [installHint, setInstallHint] = useState<"ios" | "android" | null>(null);
  const [deferred, setDeferred] = useState<any>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setData(await loadData());
      setVerifier((await getItem<Verifier>("verifier")) ?? null);
      if (navigator.storage?.persist) {
        const already = await navigator.storage.persisted?.();
        setPersisted(already || (await navigator.storage.persist()));
      }
    })();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!standalone && ios) setInstallHint("ios");
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); if (!standalone) setInstallHint("android"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const update = useCallback(async (fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev ?? emptyData());
      const withSnap = { ...next, snapshots: M.upsertSnapshot(next.snapshots, next.accounts, new Date()) };
      saveData(withSnap);
      return withSnap;
    });
  }, []);

  if (!data || verifier === undefined) return <main><p className="muted">Loading…</p></main>;
  if (verifier === null) return <Onboarding onDone={async (v, restored) => {
    await setItem("verifier", v); setVerifier(v);
    if (restored) { const d = { ...restored, lastBackupAt: new Date().toISOString() }; await saveData(d); setData(d); }
  }} />;

  const banners = (
    <>
      {installHint && !dismissed.install && (
        <div className="banner info">
          {installHint === "ios"
            ? <span>Install Drip: tap <b>Share</b> then <b>Add to Home Screen</b>. This also stops Safari clearing your data.</span>
            : <span>Install Drip on this device to keep your data safe.</span>}
          {installHint === "android" && deferred && <button className="btn small" onClick={async () => { deferred.prompt(); setDeferred(null); setInstallHint(null); }}>Install</button>}
          <button className="btn ghost small" onClick={() => setDismissed({ ...dismissed, install: true })}>✕</button>
        </div>
      )}
      {persisted === false && !dismissed.persist && (
        <div className="banner warn"><span>Your browser may clear Drip&apos;s data if storage gets low. Install the app and export backups regularly.</span>
          <button className="btn ghost small" onClick={() => setDismissed({ ...dismissed, persist: true })}>✕</button></div>
      )}
      {M.backupDue(data.lastBackupAt, data.accounts.length > 0, new Date()) && !dismissed.backup && (
        <div className="banner warn"><span>{data.lastBackupAt ? "It's been over 2 weeks since your last backup." : "You haven't backed up yet."} Your data only lives on this device.</span>
          <button className="btn small" onClick={() => setView({ name: "settings" })}>Back up</button></div>
      )}
    </>
  );

  let body: React.ReactNode;
  if (view.name === "detail") {
    const a = data.accounts.find((x) => x.id === view.id);
    body = a ? <Detail a={a} onBack={() => setView({ name: "home" })} onEdit={() => setView({ name: "add", id: a.id })}
      onLog={(p) => update((d) => ({ ...d, accounts: d.accounts.map((x) => x.id === a.id ? { ...x, payouts: [...x.payouts, p] } : x) }))}
      onDelete={() => { if (confirm(`Delete ${a.provider}?`)) { update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) })); setView({ name: "home" }); } }} /> : null;
  } else if (view.name === "add") {
    const existing = view.id ? data.accounts.find((x) => x.id === view.id) : undefined;
    body = <AddForm existing={existing} onCancel={() => setView({ name: "home" })} onSave={(a) => {
      update((d) => ({ ...d, accounts: existing ? d.accounts.map((x) => x.id === a.id ? a : x) : [...d.accounts, a] }));
      setView({ name: "detail", id: a.id });
    }} />;
  } else if (view.name === "trends") body = <Trends data={data} />;
  else if (view.name === "settings") body = <Settings data={data} verifier={verifier}
    onBackedUp={() => update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }))}
    onRestore={async (d) => { const n = { ...d, lastBackupAt: new Date().toISOString() }; await saveData(n); setData(n); }} />;
  else body = <Home data={data} open={(id) => setView({ name: "detail", id })} add={() => setView({ name: "add" })} />;

  return (
    <>
      <main>{banners}{body}<p className="disclaimer">Drip is for your own tracking. Not financial advice. Figures are estimates before tax.</p></main>
      <nav className="tabs">
        {(["home", "trends", "add", "settings"] as const).map((n) => (
          <button key={n} className={view.name === n || (n === "home" && view.name === "detail") ? "on" : ""} onClick={() => setView({ name: n } as View)}>
            {{ home: "Accounts", trends: "Trends", add: "Add", settings: "Backup" }[n]}
          </button>
        ))}
      </nav>
    </>
  );
}

function Onboarding({ onDone }: { onDone: (v: Verifier, restored?: AppData) => void }) {
  const [code] = useState(() => C.generateRecoveryCode());
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"new" | "restore">("new");
  return (
    <main>
      <h1>Welcome to Drip 💧</h1>
      <p className="muted">See what your savings and investments earn, and when it lands. Everything stays on this device. No email, no sign-up.</p>
      {mode === "new" ? (
        <div className="panel">
          <h2>Your recovery code</h2>
          <p className="muted">This code encrypts your backups. Write it down or save it in your password manager. <b>If you lose this code and this device, your data can&apos;t be recovered.</b> Nobody, including us, can reset it.</p>
          <div className="code" data-testid="code">{code}</div>
          <div className="row-gap"><button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved my recovery code somewhere safe
          </label>
          <div className="row-gap">
            <button className="btn" disabled={!saved} onClick={async () => onDone(await C.codeVerifier(code))}>Start</button>
            <button className="btn ghost" onClick={() => setMode("restore")}>Restore a backup</button>
          </div>
        </div>
      ) : (
        <div className="panel"><h2>Restore a backup</h2>
          <Restore onRestored={async (d, c) => onDone(await C.codeVerifier(c), d)} />
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
              <button key={a.id} className="card" style={{ background: `linear-gradient(135deg, ${a.colour}, #111)` }} onClick={() => open(a.id)}>
                <div className="row"><span className="prov">{a.provider}</span><span>{a.ratePct}%</span></div>
                {a.label && <div className="meta">{a.label}</div>}
                <div className="bal">{M.gbp(a.balance)}</div>
                <div className="meta">≈ {M.gbp(M.monthlyIncome(a.balance, a.ratePct))} this month · paid {fmtDate(next)}</div>
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

function Detail({ a, onBack, onEdit, onDelete, onLog }: { a: Account; onBack: () => void; onEdit: () => void; onDelete: () => void; onLog: (p: Account["payouts"][number]) => void }) {
  const [amt, setAmt] = useState(""); const [date, setDate] = useState(today());
  const next = M.nextPayout(a.nextPayoutDate, a.frequency, today());
  const history = [...a.payouts].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      <button className="btn ghost small" onClick={onBack}>← Accounts</button>
      <div className="card" style={{ background: `linear-gradient(135deg, ${a.colour}, #111)`, marginTop: 12, cursor: "default" }}>
        <div className="row"><span className="prov">{a.provider}</span><span>{a.rateType}</span></div>
        {a.label && <div className="meta">{a.label}</div>}
        <div className="bal">{M.gbp(a.balance)}</div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="muted">Rate</div><div className="v">{a.ratePct}%</div></div>
        <div className="stat"><div className="muted">Per month</div><div className="v">{M.gbp(M.monthlyIncome(a.balance, a.ratePct))}</div></div>
        <div className="stat"><div className="muted">Next payout</div><div className="v">{fmtDate(next)}</div></div>
        <div className="stat"><div className="muted">Expected ({a.frequency})</div><div className="v">{M.gbp(M.payoutAmount(a))}</div></div>
      </div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Payout history</h2>
        {history.length === 0 ? <p className="muted">No payouts logged yet.</p> :
          <ul className="list">{history.map((p, i) => {
            const diff = p.amount - M.payoutAmount(a);
            return <li key={i}><span>{fmtDate(p.date)}<br /><span className="muted">expected {M.gbp(M.payoutAmount(a))}</span></span>
              <span style={{ textAlign: "right" }}><b>{M.gbp(p.amount)}</b><br /><span className={diff >= 0 ? "ok" : "err"}>{diff >= 0 ? "+" : ""}{M.gbp(diff)}</span></span></li>;
          })}</ul>}
        <label>Log an actual payout</label>
        <div className="grid"><input inputMode="decimal" placeholder="Amount £" value={amt} onChange={(e) => setAmt(e.target.value)} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
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
  const isOther = provider === "Other" || (existing && !(existing.provider in PROVIDERS) && provider === existing.provider);
  const b = Number(balance), r = Number(rate);
  const valid = b >= 0 && balance !== "" && r >= 0 && r < 100 && rate !== "" && /^\d{4}-\d{2}-\d{2}$/.test(next) && (!isOther || custom.trim());
  return (
    <>
      <h1>{existing ? "Edit account" : "Add account"}</h1>
      <label>Provider</label>
      <select value={isOther ? "Other" : provider} onChange={(e) => setProvider(e.target.value)}>{Object.keys(PROVIDERS).map((p) => <option key={p}>{p}</option>)}</select>
      {isOther && <><label>Provider name</label><input value={custom} onChange={(e) => setCustom(e.target.value)} /></>}
      <label>Nickname (optional, stays on this device)</label><input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rainy day pot" />
      <div className="grid">
        <div><label>Balance £</label><input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="3000" /></div>
        <div><label>Rate % a year</label><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7" /></div>
        <div><label>Type</label><select value={rateType} onChange={(e) => setRateType(e.target.value as RateType)}><option value="interest">Interest</option><option value="dividend">Dividend</option></select></div>
        <div><label>Paid</label><select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Yearly</option></select></div>
      </div>
      <label>Next payout date</label><input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
      {valid && <p className="muted">≈ {M.gbp(M.monthlyIncome(b, r))} a month</p>}
      <div className="row-gap">
        <button className="btn" disabled={!valid} onClick={() => {
          const name = isOther ? custom.trim() : provider;
          onSave({ id: existing?.id ?? crypto.randomUUID(), provider: name, label: label.trim(), balance: M.round2(b), ratePct: r, rateType, frequency,
            nextPayoutDate: next, colour: PROVIDERS[name] ?? PROVIDERS.Other, payouts: existing?.payouts ?? [], createdAt: existing?.createdAt ?? new Date().toISOString() });
        }}>Save</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

function Trends({ data }: { data: AppData }) {
  const proj = useMemo(() => M.projection(data.accounts), [data.accounts]);
  const g = M.momGrowth(data.snapshots);
  const hist = data.snapshots.slice(-6);
  const max = Math.max(1, ...hist.map((s) => s.totalBalance), ...proj.map((p) => p.balance));
  const total = M.totalBalance(data.accounts);
  return (
    <>
      <h1>Trends</h1>
      <div className="grid">
        <div className="stat"><div className="muted">Total balance</div><div className="v">{M.gbp(total)}</div></div>
        <div className="stat"><div className="muted">Monthly income</div><div className="v">{M.gbp(M.totalMonthlyIncome(data.accounts))}</div></div>
        <div className="stat"><div className="muted">Weighted yield</div><div className="v">{M.weightedYield(data.accounts).toFixed(2)}%</div></div>
        <div className="stat"><div className="muted">Month on month</div><div className="v">{g === null ? "—" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`}</div></div>
      </div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Balance by month</h2>
        <p className="muted">Green: recorded. Blue: 12-month projection with interest reinvested.</p>
        <div className="bars">
          {hist.map((s) => <div key={s.month} title={M.gbp(s.totalBalance)} style={{ height: `${(s.totalBalance / max) * 100}%` }} />)}
          {proj.map((p) => <div key={p.month} className="proj" title={M.gbp(p.balance)} style={{ height: `${(p.balance / max) * 100}%` }} />)}
        </div>
        <div className="axis">{hist.map((s) => <span key={s.month}>{s.month.slice(5)}</span>)}{proj.map((p) => <span key={p.month}>+{p.month}</span>)}</div>
        <p className="muted" style={{ marginTop: 12 }}>In 12 months: <b style={{ color: "var(--text)" }}>{M.gbp(proj[11]?.balance ?? 0)}</b> (+{M.gbp((proj[11]?.balance ?? 0) - total)}), if rates stay the same.</p>
      </div>
      {g === null && <p className="muted">Month-on-month growth appears after Drip has two months of history.</p>}
    </>
  );
}

function Settings({ data, verifier, onBackedUp, onRestore }: { data: AppData; verifier: Verifier; onBackedUp: () => void; onRestore: (d: AppData) => void }) {
  const [code, setCode] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Backup</h1>
      <p className="muted">Your data lives only on this device. A backup is an encrypted file locked with your recovery code. Save it to Files or iCloud Drive.</p>
      <p className="muted">Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("en-GB") : "never"}</p>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Export</h2>
        <label>Recovery code</label><input value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
        <div className="row-gap"><button className="btn" disabled={busy || !code} onClick={async () => {
          setBusy(true); setMsg(null);
          try {
            if (!(await C.checkCode(code, verifier))) { setMsg({ ok: false, t: "That isn't your recovery code." }); return; }
            const file = await C.encryptBackup(data, code);
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
        <Restore onRestored={(d) => { if (confirm("Replace all data on this device with this backup?")) onRestore(d); }} />
      </div>
    </>
  );
}

function Restore({ onRestored }: { onRestored: (d: AppData, code: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <>
      <label>Backup file</label><input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <label>Recovery code</label><input value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
      <div className="row-gap"><button className="btn" disabled={!file || !code || busy} onClick={async () => {
        setBusy(true); setErr("");
        try {
          const d = await C.decryptBackup(JSON.parse(await file!.text()), code);
          if (!isAppData(d)) throw new C.BackupError("The backup's contents aren't valid.");
          onRestored(d, code);
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
