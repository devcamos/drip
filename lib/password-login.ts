import { checkCode } from "./crypto";
import { authClient, cloudKey, connect, readCloudState, recoveryCredentials, syncNow, vault, writeCloudState } from "./cloud";
import { claimEmptyPasswordDevice, getItem, passwordUnlockContext, savePasswordUnlock } from "./db";
import { finishDeviceSignOut, notifyDeviceSession, readDeviceSession, restoreOtherAccount, unlockDevice } from "./device-session";
import { loginTag, passwordError, passwordProof, unwrapPasswordRoot, validLoginTag, validPasswordWrap, wrapPasswordRoot } from "./password-crypto";
import { resolveRecoveryCode } from "./recovery-codes";
import { safeFetch } from "./worker-safety";
import type { AppData } from "./types";

async function call(path: string, body: unknown, headers?: Record<string, string>) {
  const response = await safeFetch(`/api/auth/${path}`, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const value = await response.json();
  if (response.status === 429) throw new Error("Too many sign-in attempts. Try again shortly.");
  if (!response.ok) throw new Error(value.message ?? "Could not sign in. Try again online.");
  return value;
}
export async function passwordUsername() { return (await passwordUnlockContext()).envelope?.username; }

/** Set/reset requires the recovery key and the existing cloud identity. */
export async function setLoginPassword(code: string, username: string, password: string, data: AppData) {
  const name = loginTag(username); const error = passwordError(password);
  if (!validLoginTag(name)) throw new Error("Use 3–16 letters, numbers or underscores for your gamertag.");
  if (error) throw new Error(error);
  const { binding } = await passwordUnlockContext(); if (!binding) throw new Error("Unlock your local accounts first.");
  const root = await resolveRecoveryCode(code);
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (!verifier || !(await checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
  const recovery = await recoveryCredentials(root);
  let existing;
  try { existing = (await authClient.getSession()).data?.user; } catch { /* Verified recovery can renew an expired session. */ }
  const account = existing && existing.email === recovery.email ? { user: existing, key: await cloudKey(root) } : await connect(root, data, true, undefined, binding.generation);
  let state = await readCloudState();
  if (state && state.userId !== account.user.id) throw new Error("Cloud account changed. Your local accounts are kept.");
  if (!state) {
    const remote = await vault("GET", undefined, account.user.id);
    if (remote.version === 0) {
      await writeCloudState({ userId: account.user.id, identityId: data.identity!.id, key: account.key, version: 0, dirty: true, lastSyncAt: null, generation: crypto.randomUUID(), revision: 0 }, { generation: binding.generation });
      state = await readCloudState();
    }
  }
  if (state) await syncNow();
  if (!(await vault("GET", undefined, account.user.id)).envelope) throw new Error("Your cloud copy is still being saved. Wait a moment, then save your password again.");
  const envelope = await wrapPasswordRoot(root, name, password, account.user.id);
  await call("gamertag-password", { username: name, proof: await passwordProof(name, password), recoveryProof: recovery.password, envelope }, { "X-Drip-Owner": account.user.id, ...(binding.generation ? { "X-Drip-Reconnect": binding.generation } : {}) });
  try { await savePasswordUnlock(envelope, binding); }
  catch { throw new Error("Password saved online, but this browser could not save offline unlock. Keep your recovery code; sign in online with the new password."); }
  return name;
}

export async function signInPassword(username: string, password: string, replaceExisting = false) {
  const name = loginTag(username);
  if (!validLoginTag(name) || !password || password.length > 256) throw new Error("Gamertag or password is incorrect.");
  const before = await readDeviceSession(); const local = await passwordUnlockContext();
  let envelope = local.envelope;
  if (navigator.onLine) {
    if (before?.signedOut) await finishDeviceSignOut();
    const headers: Record<string, string> | undefined = before?.signedOut ? { "X-Drip-Resume": before.generation } : before?.generation ? { "X-Drip-Reconnect": before.generation } : undefined;
    const remote = await call("sign-in/gamertag", { username: name, proof: await passwordProof(name, password) }, headers);
    if (!validPasswordWrap(remote.envelope) || remote.owner !== remote.envelope.owner) throw new Error("Invalid encrypted sign-in response.");
    envelope = remote.envelope;
  } else if (!envelope || envelope.username !== name) {
    throw new Error("Connect to the internet to sign in on this browser for the first time.");
  }
  const root = await unwrapPasswordRoot(envelope, name, password);
  const current = await readDeviceSession();
  if (current?.generation !== before?.generation || !!current?.signedOut !== !!before?.signedOut) throw new Error("Device session changed. Try signing in again.");
  if (local.binding && !replaceExisting) {
    const verifier = await getItem<{ salt: string; hash: string }>("verifier");
    if (!verifier || !(await checkCode(root, verifier))) throw new Error("This browser keeps a different account. Choose Use another account to restore this sign-in.");
    await unlockDevice(root, local.binding);
  } else {
    if (local.binding && !before?.signedOut) throw new Error("Sign out before switching accounts.");
    const generation = local.binding ? before?.generation : await claimEmptyPasswordDevice(before?.generation);
    await restoreOtherAccount(root, { generation, userId: envelope?.owner }, !local.binding);
  }
  const fresh = await passwordUnlockContext();
  if (fresh.binding && envelope) await savePasswordUnlock(envelope, fresh.binding);
  notifyDeviceSession();
}
