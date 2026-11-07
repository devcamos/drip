"use client";

import { useEffect, useRef } from "react";
import type { IncomePeriod } from "./demo-accounts";
import s from "./welcome.module.css";

type Props = {
  open: boolean;
  counts: { cash: number; stocks: number; credits: number };
  incomePeriod: IncomePeriod;
  onIncomePeriod: (period: IncomePeriod) => void;
  onClose: () => void;
  onAccounts: () => void;
  onFeedback: () => void;
  onSignOut: () => void;
};

export default function ProfilePreview({ open, counts, incomePeriod, onIncomePeriod, onClose, onAccounts, onFeedback, onSignOut }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return <dialog id="demo-profile" ref={dialog} className={`${s.chooser} ${s.profileDialog}`} aria-labelledby="profile-heading" onCancel={onClose}>
    <div className={s.sectionHeading}><span className={s.eyebrow}>YOUR CORNER OF DRIP</span><button className={s.closeButton} onClick={onClose} aria-label="Close profile and settings">×</button></div>
    <h2 id="profile-heading">Profile &amp; settings</h2>
    <div className={s.profileIdentity}><span className={s.profileAvatar} aria-hidden="true">dg</span><div><small>Gamertag</small><strong>demo_grower</strong><span>Sample profile · No real account connected</span></div></div>
    <section className={s.profileSection} aria-label="Your profile accounts"><h3>Your accounts</h3><p>Keep every holding and credit card in its own account.</p><dl className={s.profileCounts}><div><dt>Savings</dt><dd>{counts.cash}</dd></div><div><dt>Holdings</dt><dd>{counts.stocks}</dd></div><div><dt>Credit cards</dt><dd>{counts.credits}</dd></div></dl><button className={s.profileLink} onClick={onAccounts}>Manage sample accounts <span aria-hidden="true">↗</span></button></section>
    <section className={s.profileSection} aria-label="Profile preferences"><h3>Preferences</h3><p>Show your income outlook by default as:</p><div className={s.modePicker} role="group" aria-label="Default income period"><button aria-pressed={incomePeriod === "month"} onClick={() => onIncomePeriod("month")}>Monthly</button><button aria-pressed={incomePeriod === "year"} onClick={() => onIncomePeriod("year")}>Yearly</button></div><small>Amounts in GBP. Demo preferences reset when you reload or reset the demo.</small></section>
    <details className={s.profileSecurity}><summary>Security &amp; devices <span>Planned</span></summary><p>Password, original recovery codes and up to four devices belong here in the full app. These controls aren’t connected in this prototype.</p></details>
    <div className={s.profileActions}><button className={s.profileLink} onClick={onFeedback}>Give feedback <span aria-hidden="true">↗</span></button><button className={s.demoSignOut} onClick={onSignOut}>Sign out of demo</button></div>
  </dialog>;
}
