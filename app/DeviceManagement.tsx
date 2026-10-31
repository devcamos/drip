"use client";
import { useEffect, useRef, useState } from "react";
import { listSignedInDevices, signOutRemoteDevice, type SignedInDevice } from "@/lib/device-management";
import { passwordUsername } from "@/lib/password-login";
import { signOutDevice } from "@/lib/device-session";
import { localSessionBinding, type LocalSessionBinding } from "@/lib/db";
import { SIGNED_IN_DEVICE_LIMIT } from "@/lib/device-policy";

function signedInDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function DeviceManager({ username, password, onClose, onContinue }: Readonly<{ username: string; password: string; onClose: () => void; onContinue?: () => Promise<void> }>) {
  const [devices, setDevices] = useState<SignedInDevice[]>();
  const [selected, setSelected] = useState<SignedInDevice>();
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const binding = useRef<LocalSessionBinding | null>(null);
  const heading = useRef<HTMLHeadingElement>(null); const confirmation = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) confirmation.current?.focus(); }, [selected]);
  useEffect(() => {
    heading.current?.focus();
    const pending = new AbortController(); controller.current = pending;
    setLoading(true);
    void (async () => {
      const original = await localSessionBinding();
      if (pending.signal.aborted) return;
      binding.current = original;
      const value = await listSignedInDevices(username, password, pending.signal);
      if (!pending.signal.aborted) setDevices(value);
    })()
      .catch(() => { if (!pending.signal.aborted) setError("Could not load devices. Go back and check your password, or try again online."); })
      .finally(() => { if (!pending.signal.aborted) setLoading(false); });
    return () => pending.abort();
  }, [username, password]);
  async function remove() {
    if (!selected || busy) return;
    setBusy(true); setError(""); setMessage("");
    const signal = controller.current?.signal;
    try {
      const result = await signOutRemoteDevice(username, password, selected.id, signal);
      if (signal?.aborted) return;
      if (result.current && !onContinue) {
        if (!binding.current) throw new Error("Reopen device management before signing out this browser.");
        await signOutDevice(binding.current); return;
      }
      setSelected(undefined);
      setMessage(result.removed ? "Device signed out. Its saved accounts have not been erased." : "That device is already signed out.");
      const fresh = await listSignedInDevices(username, password, signal);
      if (signal?.aborted) return;
      setDevices(fresh);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not sign out this device. Try again."); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  async function continueSignIn() {
    if (!onContinue || busy) return;
    setBusy(true); setError("");
    try { await onContinue(); }
    catch (cause) { if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not sign in. Try again."); }
    finally { if (!controller.current?.signal.aborted) setBusy(false); }
  }
  return <section className="panel device-manager" aria-label="Manage signed-in devices" aria-busy={loading || busy}>
    <h2 ref={heading} tabIndex={-1}>Your signed-in devices</h2>
    <p>You can use Drip on up to {SIGNED_IN_DEVICE_LIMIT} browsers or devices. Sign out an old one to make room.</p>
    <p className="muted">Safari and a Home Screen app can count separately. Names are estimated from browser information.</p>
    {loading && <output>Checking your devices…</output>}
    {devices && <>
      <p className="device-count">{devices.length} of {SIGNED_IN_DEVICE_LIMIT} sign-ins in use</p>
      <ul className="device-list">{devices.map(device => <li key={device.id}>
        <div><h3>{device.name}</h3>{device.current && <span className="device-current">This browser</span>}<p className="muted">Signed in {signedInDate(device.signedInAt)}</p></div>
        <button type="button" className="btn ghost small" disabled={busy} aria-label={`Sign out ${device.name}`} onClick={() => { setSelected(device); setError(""); setMessage(""); }}>Sign out</button>
      </li>)}</ul>
      {!devices.length && <p>No devices are currently signed in.</p>}
    </>}
    {selected && <section ref={confirmation} tabIndex={-1} className="device-confirm" aria-label="Confirm device sign-out">
      <h3>Sign out {selected.name}?</h3>
      <p>This removes its online access. Offline copies are not erased, and anyone with your password can sign in again.</p>
      {selected.current && !onContinue && <p>You will be signed out here too. Sync any changes before continuing.</p>}
      <div className="row-gap"><button type="button" className="btn danger" disabled={busy} onClick={remove}>{busy ? "Signing out…" : "Confirm sign out"}</button><button type="button" className="btn ghost" disabled={busy} onClick={() => setSelected(undefined)}>Keep device</button></div>
    </section>}
    {message && <output className="ok">{message}</output>}
    {error && <output role="alert" className="err">{error}</output>}
    <div className="row-gap">{onContinue && devices && devices.length < SIGNED_IN_DEVICE_LIMIT && <button type="button" className="btn" disabled={busy} onClick={continueSignIn}>Sign in on this device</button>}<button type="button" className="text-link" disabled={busy} onClick={onClose}>{onContinue ? "Back to sign in" : "Close devices"}</button></div>
  </section>;
}

export function DeviceSettings() {
  const [username, setUsername] = useState<string>();
  const [password, setPassword] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => { let active = true; void passwordUsername().then(value => { if (active) setUsername(value); }).catch(() => {}); return () => { active = false; }; }, []);
  if (open && username) return <DeviceManager username={username} password={password} onClose={() => { setOpen(false); setPassword(""); }} />;
  return <section className="panel" aria-label="Signed-in devices">
    <h2>Signed-in devices</h2><p className="muted">See your active sign-ins and sign out a browser you no longer use. Up to {SIGNED_IN_DEVICE_LIMIT} can be signed in.</p>
    {username ? <form onSubmit={event => { event.preventDefault(); if (password) setOpen(true); }}>
      <label htmlFor="devices-password">Confirm password to manage devices</label><input id="devices-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
      <button type="submit" className="btn ghost" disabled={!password}>Manage devices</button>
    </form> : <p className="muted">Set a sign-in password above to manage your devices.</p>}
  </section>;
}
