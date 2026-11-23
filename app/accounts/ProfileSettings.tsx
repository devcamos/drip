"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTag, handleError, type Identity } from "@/lib/identity";
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
  onFeedback: () => void;
  onRenameIdentity: (handle: string) => Promise<Identity>;
  onRenameBusyChange?: (busy: boolean) => void;
  signOut: ReactNode;
  preferenceBusy?: boolean;
  preferenceStatus?: string;
  preferenceError?: string;
}>;

export function ProfileSettings({ open, identity, counts, incomePeriod, onIncomePeriod, onClose, onAccounts, onSettings, onPayments, onFeedback, onRenameIdentity, onRenameBusyChange, signOut, preferenceBusy = false, preferenceStatus, preferenceError }: ProfileSettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [handle, setHandle] = useState(identity?.handle ?? ""); const [renameBusy, setRenameBusy] = useState(false); const [renameMessage, setRenameMessage] = useState(""); const [renameError, setRenameError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    if (open) { if (!element.open) element.showModal(); element.scrollTop = 0; }
    else if (element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [open]);
  useEffect(() => { setHandle(identity?.handle ?? ""); }, [identity?.id, identity?.handle]);
  async function rename() {
    const invalid = handleError(handle);
    if (invalid) { setRenameError(invalid); return; }
    setRenameBusy(true); onRenameBusyChange?.(true); setRenameError(""); setRenameMessage("");
    try { const next = await onRenameIdentity(handle); setHandle(next.handle); setRenameMessage(`Profile gamertag saved as ${formatTag(next)}.`); }
    catch (error) { setRenameError(error instanceof Error ? error.message : "Could not change your profile gamertag. Try again."); }
    finally { setRenameBusy(false); onRenameBusyChange?.(false); }
  }
  return <dialog id="drip-profile-settings" ref={dialog} className={s.profileDialog} aria-labelledby="drip-profile-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={s.dialogHeading}><span className={s.eyebrow}>YOUR CORNER OF DRIP</span><button className={s.closeButton} onClick={onClose} aria-label="Close profile and settings">×</button></div>
    <h2 id="drip-profile-heading">Profile &amp; settings</h2>
    <div className={s.profileIdentity}><span className={s.profileAvatar} aria-hidden="true">{profileInitials(identity)}</span><div><small>{identity ? "Profile gamertag" : "Profile"}</small><strong>{identity ? formatTag(identity) : "Your profile"}</strong><span>Your accounts, in one place.</span></div></div>
    {identity && <section className={s.profileSection} aria-label="Profile gamertag"><h3>Profile gamertag</h3><p>This display name is separate from the gamertag you use to sign in.</p><label className={s.profileHandleLabel} htmlFor="profile-gamertag">Display gamertag</label><input id="profile-gamertag" autoComplete="off" maxLength={16} value={handle} disabled={renameBusy} onChange={event => { setHandle(event.target.value); setRenameError(""); setRenameMessage(""); }} /><button className={s.profileLink} disabled={renameBusy || handle === identity.handle} onClick={() => void rename()}>{renameBusy ? "Saving…" : "Save profile gamertag"}</button>{renameMessage ? <p className={s.preferenceStatus} role="status">{renameMessage}</p> : null}{renameError ? <p className={s.preferenceError} role="alert">{renameError}</p> : null}</section>}
    <section className={s.profileSection} aria-label="Your profile accounts"><h3>Your accounts</h3><p>Keep every holding and credit card in its own account.</p><dl className={s.profileCounts}><div><dt>Savings</dt><dd>{counts.cash}</dd></div><div><dt>Holdings</dt><dd>{counts.stocks}</dd></div><div><dt>Credit cards</dt><dd>{counts.credits}</dd></div></dl><button className={s.profileLink} onClick={onAccounts}>Manage accounts <span aria-hidden="true">↗</span></button></section>
    <section className={s.profileSection} aria-label="Profile preferences"><h3>Preferences</h3><p>Show your income outlook by default as:</p><div className={s.periodPicker} role="group" aria-label="Default income period"><button disabled={preferenceBusy} aria-pressed={incomePeriod === "month"} onClick={() => onIncomePeriod("month")}>Monthly</button><button disabled={preferenceBusy} aria-pressed={incomePeriod === "year"} onClick={() => onIncomePeriod("year")}>Yearly</button></div><small>On this device · Amounts in GBP</small>{preferenceBusy || preferenceStatus ? <p className={s.preferenceStatus} role="status">{preferenceBusy ? "Saving preference…" : preferenceStatus}</p> : null}{preferenceError ? <p className={s.preferenceError} role="alert">{preferenceError}</p> : null}</section>
    <section className={s.profileSection} aria-label="Profile services"><button className={s.settingsRow} onClick={onSettings}><span><b>Security &amp; devices</b><small>Password, recovery codes, passkeys and devices</small></span><span aria-hidden="true">↗</span></button><button className={s.settingsRow} onClick={onPayments}><span><b>Payment reminders</b><small>Expected dates and optional phone notifications</small></span><span aria-hidden="true">↗</span></button><button className={s.settingsRow} onClick={onFeedback}><span><b>Give feedback</b><small>Report a problem or suggest an improvement</small></span><span aria-hidden="true">↗</span></button></section>
    <div className={s.profileSignOut}>{signOut}</div>
  </dialog>;
}
