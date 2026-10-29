"use client";
import { useEffect, useRef, useState } from "react";
import type { Account } from "@/lib/types";
import * as Phone from "@/lib/phone-reminders";

export function PhoneReminders({ identityId }: Readonly<{ accounts: Account[]; identityId?: string }>) {
  const [capability, setCapability] = useState<ReturnType<typeof Phone.phoneCapability>>();
  const [configuration, setConfiguration] = useState<Awaited<ReturnType<typeof Phone.phoneConfiguration>>>();
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const current = ++sequence.current;
    const support = Phone.phoneCapability(); setCapability(support); setConfiguration(undefined); setEnabled(false); setBusy(false); setMessage(""); setFailure(false);
    if (support !== "supported" || !identityId) return;
    void (async () => {
      const config = await Phone.phoneConfiguration();
      const on = config.available ? await Phone.phoneReminderStatus(identityId) : false;
      if (current === sequence.current) { setConfiguration(config); setEnabled(on); }
    })().catch(() => { if (current === sequence.current) { setFailure(true); setMessage("Could not load phone reminder settings. Try again."); } });
    return () => { sequence.current++; };
  }, [identityId, attempt]);
  async function perform(work: () => Promise<void>, success: string) {
    const current = sequence.current;
    setBusy(true); setMessage(""); setFailure(false);
    try { await work(); const on = await Phone.phoneReminderStatus(identityId!); if (current === sequence.current) { setEnabled(on); setMessage(success); } }
    catch (error) { if (current === sequence.current) { if (error instanceof Phone.PhoneReminderError && error.code === "PUSH_SUBSCRIPTION_EXPIRED") setEnabled(false); setFailure(true); setMessage((error as Error).message); } }
    finally { if (current === sequence.current) setBusy(false); }
  }
  return <section className="panel phone-reminders" aria-labelledby="phone-reminders-title"><div className="wallet-heading"><h2 id="phone-reminders-title">Phone notifications</h2><span className={`phone-status ${enabled ? "is-on" : ""}`}>{enabled ? "On" : "Off"}</span></div>
    <p className="muted">Get a reminder on expected payment dates, even while Drip is closed. Only generic messages appear on your lock screen.</p>
    {capability === "install" ? <p className="muted">On iPhone or iPad, tap Share → Add to Home Screen. Open the installed Drip app, then turn on reminders here.</p> : capability === "unsupported" ? <p className="muted">Phone notifications are not supported in this browser. Your in-app reminders still work.</p> : !identityId ? <p className="muted">Sign in and connect cloud recovery to turn on phone reminders.</p> : configuration?.available === false ? <p className="muted">Phone notifications are not available on this deployment yet. Your in-app reminders are ready.</p> : <>
      <p className="muted">Checked daily around 09:00–10:00 UTC, using this device&apos;s saved payment dates and time zone. Delivery depends on your device and connection. Reminders can continue while signed out; turn them off here or in device settings.</p>
      <p className="muted">Turning this on saves payment dates and an encrypted notification address on Drip&apos;s server. Account names, balances and income amounts are not included.</p>
      <div className="row-gap">{enabled ? <><button className="btn ghost" disabled={busy} onClick={() => void perform(() => Phone.disablePhoneReminders(identityId), "Phone reminders turned off for this device.")}>Turn off</button><button className="btn" disabled={busy} onClick={() => void perform(() => Phone.testPhoneReminder(identityId), "Test accepted by the notification service. Check your device.")}>Send test notification</button></> : <button className="btn" disabled={busy || !configuration?.publicKey} onClick={() => {
        try {
          const permission = Notification.requestPermission();
          void perform(() => Phone.enablePhoneReminders(identityId, configuration!.publicKey!, permission), "Phone reminders are on for this device.");
        } catch { setFailure(true); setMessage("Could not ask for notification permission. Check this device's settings."); }
      }}>{busy ? "Updating…" : "Turn on phone reminders"}</button>}</div>
      {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="muted">Notifications are blocked in your device or browser settings. Allow them there, then try again.</p>}
    </>}
    {message && <p role={failure ? "alert" : "status"} className={failure ? "err" : "ok"}>{message}</p>}
    {failure && <button className="btn ghost small" disabled={busy} onClick={() => { setMessage(""); setFailure(false); setAttempt(value => value + 1); }}>Retry settings</button>}
  </section>;
}

export function PhoneReminderSync({ identityId, accounts, onManage }: Readonly<{ identityId?: string; accounts: Account[]; onManage: () => void }>) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, running = false;
    const refresh = async () => {
      if (!identityId || running || document.visibilityState !== "visible" || !navigator.onLine) return;
      running = true;
      try { await Phone.syncPhoneReminders(identityId); if (active) setFailed(false); }
      catch { if (active) setFailed(true); }
      finally { running = false; }
    };
    const initial = setTimeout(() => { void refresh(); }, 400);
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("online", refresh); window.addEventListener("drip-phone-reminders-changed", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearTimeout(initial); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("drip-phone-reminders-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [identityId, accounts]);
  return failed ? <div className="banner warn"><span>Phone reminders could not be updated. Your in-app reminders still work.</span><button className="btn ghost small" onClick={onManage}>Manage</button></div> : null;
}
