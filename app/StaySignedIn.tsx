"use client";
import { trustThisDevice } from "@/lib/db";
import s from "./StaySignedIn.module.css";

/** Opt-in only: a shared device should not stay open unless the user asks. */
export function StaySignedIn({ id, checked, onChange, disabled = false }: Readonly<{ id: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }>) {
  return <div className={s.stay}>
    <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-describedby={`${id}-hint`} />
    <label htmlFor={id}>Keep me signed in on this device</label>
    <p id={`${id}-hint`} className="muted">For 30 days, renewed each time you open Drip. Signing out ends it. Don&apos;t use on a shared device.</p>
  </div>;
}

/** Sign-in has already succeeded; failing to remember the device must not undo it. */
export async function keepSignedIn(stay: boolean): Promise<boolean> {
  if (!stay) return false;
  try { await trustThisDevice(); return true; } catch { return false; }
}
