"use client";

import type { Ref } from "react";
import { formatTag, type Identity } from "@/lib/identity";
import { profileInitials } from "./presentation";
import s from "./accounts.module.css";

export type AppAccountHeaderProps = Readonly<{
  identity?: Identity;
  pendingPayments: number;
  onProfile: () => void;
  onPayments: () => void;
  profileButtonRef?: Ref<HTMLButtonElement>;
  profileOpen?: boolean;
}>;

export function AppAccountHeader({ identity, pendingPayments, onProfile, onPayments, profileButtonRef, profileOpen = false }: AppAccountHeaderProps) {
  return <header className={s.appHeader}>
    <div className={s.brand}><img src="/icon-192.png?v=drip-growth-1" alt="" width="44" height="44" /><span>Drip<span className={s.brandDot}>.</span>{identity ? <small className={s.brandHandle} title={formatTag(identity)} data-testid="header-tag">{formatTag(identity)}</small> : null}</span></div>
    <div className={s.headerActions}>
      <button className={s.paymentBell} aria-label={`Payment notifications, ${pendingPayments} to check`} onClick={onPayments}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span aria-hidden="true">{pendingPayments}</span></button>
      <button ref={profileButtonRef} className={s.avatarButton} title="Profile & settings" aria-label={identity ? `Open profile and settings for ${formatTag(identity)}` : "Open profile and settings"} aria-haspopup="dialog" aria-controls="drip-profile-settings" aria-expanded={profileOpen} onClick={onProfile}>{profileInitials(identity)}</button>
    </div>
  </header>;
}
