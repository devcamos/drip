"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatTag, type Identity } from "@/lib/identity";
import { profileInitials, type AccountCounts, type IncomePeriod } from "./presentation";
import s from "./accounts.module.css";

export type ProfileSettingsProps = Readonly<{
  open: boolean;
  identity?: Identity;
  counts: AccountCounts;
  incomePeriod: IncomePeriod;
  onIncomePeriod: (period: IncomePeriod) => void;
  onClose: () => void;
  onAccounts: () => void;
  onSettings: () => void;
  onPayments: () => void;
  signOut: ReactNode;
  preferenceBusy?: boolean;
  preferenceStatus?: string;
  preferenceError?: string;
}>;

export function ProfileSettings({ open, identity, counts, incomePeriod, onIncomePeriod, onClose, onAccounts, onSettings, onPayments, signOut, preferenceBusy = false, preferenceStatus, preferenceError }: ProfileSettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (open) { if (!element.open) element.showModal(); element.scrollTop = 0; }
    else if (element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [open]);
  return <dialog id="drip-profile-settings" ref={dialog} className={s.profileDialog} aria-labelledby="drip-profile-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={s.dialogHeading}><span className={s.eyebrow}>YOUR CORNER OF DRIP</span><button className={s.closeButton} onClick={onClose} aria-label="Close profile and settings">×</button></div>
    <h2 id="drip-profile-heading">Profile &amp; settings</h2>
    <div className={s.profileIdentity}><span className={s.profileAvatar} aria-hidden="true">{profileInitials(identity)}</span><div><small>{identity ? "Gamertag" : "Profile"}</small><strong>{identity ? formatTag(identity) : "Your profile"}</strong><span>Your accounts, in one place.</span></div></div>
    <section className={s.profileSection} aria-label="Your profile accounts"><h3>Your accounts</h3><p>Keep every holding and credit card in its own account.</p><dl className={s.profileCounts}><div><dt>Savings</dt><dd>{counts.cash}</dd></div><div><dt>Holdings</dt><dd>{counts.stocks}</dd></div><div><dt>Credit cards</dt><dd>{counts.credits}</dd></div></dl><button className={s.profileLink} onClick={onAccounts}>Manage accounts <span aria-hidden="true">↗</span></button></section>
    <section className={s.profileSection} aria-label="Profile preferences"><h3>Preferences</h3><p>Show your income outlook by default as:</p><div className={s.periodPicker} role="group" aria-label="Default income period"><button disabled={preferenceBusy} aria-pressed={incomePeriod === "month"} onClick={() => onIncomePeriod("month")}>Monthly</button><button disabled={preferenceBusy} aria-pressed={incomePeriod === "year"} onClick={() => onIncomePeriod("year")}>Yearly</button></div><small>On this device · Amounts in GBP</small>{preferenceBusy || preferenceStatus ? <p className={s.preferenceStatus} role="status">{preferenceBusy ? "Saving preference…" : preferenceStatus}</p> : null}{preferenceError ? <p className={s.preferenceError} role="alert">{preferenceError}</p> : null}</section>
    <section className={s.profileSection} aria-label="Profile security and reminders"><button className={s.settingsRow} onClick={onSettings}><span><b>Security &amp; devices</b><small>Password, recovery codes, passkeys and devices</small></span><span aria-hidden="true">↗</span></button><button className={s.settingsRow} onClick={onPayments}><span><b>Payment reminders</b><small>Expected dates and optional phone notifications</small></span><span aria-hidden="true">↗</span></button></section>
    <div className={s.profileSignOut}>{signOut}</div>
  </dialog>;
}
