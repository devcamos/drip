import { checkCode, codeVerifier, generateRecoveryCode } from "./crypto";
import { authClient, cloudKey, connect, readCloudState, recoveryCredentials, seal, syncNow, vault, writeCloudState } from "./cloud";
import { claimEmptyPasswordDevice, commitCloudRestore, completeDeviceSession, getItem, isAppData, passwordUnlockContext, reserveSignupReplacement, savePasswordUnlock, type RetainedAccount, type SignupReplacement, type VaultBinding } from "./db";
import { AccountSwitchRequired } from "./account-switch";
import { finishDeviceSignOut, notifyDeviceSession, readDeviceSession, restoreOtherAccount, signOutDevice, unlockDevice, type DeviceSession } from "./device-session";
import { loginTag, passwordError, passwordProof, unwrapPasswordRoot, validLoginTag, validPasswordWrap, wrapPasswordRoot, type PasswordWrap } from "./password-crypto";
import { resolveRecoveryCode } from "./recovery-codes";
import { originalRecoveryCodes } from "./original-recovery-codes";
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

/** Register cloud/password access before atomically installing a new local vault. */
export async function signUpPassword(username: string, password: string, data: AppData, replaceExisting = false) {
  const name = loginTag(username); const error = passwordError(password);
  if (!validLoginTag(name) || !data.identity) throw new Error("Use 3–16 letters, numbers or underscores for your gamertag.");
  if (error) throw new Error(error);
  if (!isAppData(data) || (replaceExisting && (data.accounts.length > 0 || data.snapshots.length > 0))) throw new Error("A new account must start empty. Your current local account is kept.");
  if (!navigator.onLine) throw new Error("Connect to the internet to create your account.");
  let before = await readDeviceSession();
  let replacement: SignupReplacement | undefined;
  const existing = (await passwordUnlockContext()).binding || await getItem("verifier");
  if (replaceExisting && existing) {
    if (!before?.signedOut) await signOutDevice();
    await finishDeviceSignOut();
    replacement = await reserveSignupReplacement();
    before = await readDeviceSession();
  } else if (before?.signedOut || existing) throw new Error("This browser already has an account. Sign in instead.");
  const root = generateRecoveryCode();
  let signupOwner = "";
  try {
  const { user, key } = await connect(root, data, true, replacement?.generation, undefined, replacement?.nonce);
  signupOwner = user.id;
  const remote = await vault("GET", undefined, user.id, replacement?.generation, replacement?.nonce);
  if (remote.version !== 0 || remote.envelope) throw new Error("Account setup changed. Try again.");
  const saved = await vault("PUT", { version: 0, envelope: await seal(data, key) }, user.id, replacement?.generation, replacement?.nonce);
  const envelope = await wrapPasswordRoot(root, name, password, user.id);
  const recovery = await recoveryCredentials(root);
  await call("gamertag-password", { username: name, proof: await passwordProof(name, password), recoveryProof: recovery.password, envelope }, { "X-Drip-Owner": user.id, ...(replacement ? { "X-Drip-Resume": replacement.generation, "X-Drip-Signup": replacement.nonce } : {}) });
  await commitCloudRestore(data, { userId: user.id, identityId: data.identity.id, key, version: saved.version, dirty: false, lastSyncAt: saved.updated_at ?? new Date().toISOString(), generation: crypto.randomUUID(), revision: 0 }, await codeVerifier(root), before?.generation, replacement?.generation, root, envelope, replacement);
  } catch (error) {
    if (replacement) {
      // Revoke only while this exact signup still owns the device generation.
      // A later tab's sign-in must never be signed out by delayed cleanup.
      const current = await readDeviceSession();
      if (current?.signedOut && current.generation === replacement.generation) {
        let remotePending = true;
        try { const result = await authClient.signOut({ fetchOptions: { headers: { "X-Drip-Signout": replacement.generation } } }); remotePending = !!result.error; } catch { /* Retry on return; local ciphertext remains intact. */ }
        await completeDeviceSession(replacement.generation, { signedOut: true, remotePending, generation: replacement.generation });
      }
    }
    throw error;
  }
  // Account creation is complete. The required recovery step can retry if
  // storage or the connection fails; it must not turn a created account into a
  // misleading signup failure. The first file is encrypted before registration.
  try { await originalRecoveryCodes(root, signupOwner, AbortSignal.timeout(3000)); }
  catch { /* The required download step remains visible until completed. */ }
  notifyDeviceSession();
}

/** Password confirmation can create recovery codes without an earlier code. */
export async function passwordRecoveryRoot(password: string) {
  const before = await passwordUnlockContext();
  if (!before.binding || !before.envelope) throw new Error("Sign in with your password first.");
  const root = await unwrapPasswordRoot(before.envelope, before.envelope.username, password);
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  const fresh = await passwordUnlockContext();
  if (fresh.binding?.vaultId !== before.binding.vaultId || fresh.binding?.generation !== before.binding.generation || fresh.envelope?.ct !== before.envelope.ct || !verifier || !(await checkCode(root, verifier))) throw new Error("Account changed. Sign in again before creating recovery codes.");
  return root;
}

async function preparePasswordCloud(root: string, data: AppData, binding: VaultBinding) {
  const recovery = await recoveryCredentials(root);
  let existing;
  try { existing = (await authClient.getSession()).data?.user; } catch { /* Verified recovery can renew an expired session. */ }
  const account = existing?.email === recovery.email ? { user: existing!, key: await cloudKey(root) } : await connect(root, data, true, undefined, binding.generation);
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
  return { account, recovery };
}

/** Set/reset requires the recovery key and the existing cloud identity. */
export async function setLoginPassword(code: string, username: string, password: string, data: AppData) {
  const name = loginTag(username); const error = passwordError(password);
  if (!validLoginTag(name)) throw new Error("Use 3–16 letters, numbers or underscores for your gamertag.");
  if (error) throw new Error(error);
  const { binding } = await passwordUnlockContext(); if (!binding) throw new Error("Unlock your local accounts first.");
  const root = await resolveRecoveryCode(code);
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (!verifier || !(await checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
  const { account, recovery } = await preparePasswordCloud(root, data, binding);
  const envelope = await wrapPasswordRoot(root, name, password, account.user.id);
  await call("gamertag-password", { username: name, proof: await passwordProof(name, password), recoveryProof: recovery.password, envelope }, { "X-Drip-Owner": account.user.id, ...(binding.generation ? { "X-Drip-Reconnect": binding.generation } : {}) });
  try { await savePasswordUnlock(envelope, binding); }
  catch { throw new Error("Password saved online, but this browser could not save offline unlock. Keep your recovery code; sign in online with the new password."); }
  return name;
}

type LocalPassword = Awaited<ReturnType<typeof passwordUnlockContext>>;
async function signInEnvelope(name: string, password: string, before: DeviceSession | undefined, local: LocalPassword, inspected?: PasswordWrap): Promise<PasswordWrap> {
  if (!navigator.onLine) {
    if (local.envelope?.username !== name) throw new Error("Connect to the internet to sign in on this browser for the first time.");
    return local.envelope;
  }
  if (before?.signedOut) await finishDeviceSignOut();
  let headers: Record<string, string> | undefined;
  if (before?.signedOut) headers = { "X-Drip-Resume": before.generation };
  else if (before?.generation) headers = { "X-Drip-Reconnect": before.generation };
  const remote = await call(inspected ? "sign-in/gamertag" : "sign-in/gamertag-key", { username: name, proof: await passwordProof(name, password), ...(inspected ? { expectedOwner: inspected.owner, expectedEnvelope: inspected.ct } : {}) }, headers);
  if (!validPasswordWrap(remote.envelope) || remote.owner !== remote.envelope.owner) throw new Error("Invalid encrypted sign-in response.");
  return remote.envelope;
}
async function openPasswordAccount(root: string, envelope: PasswordWrap, local: LocalPassword, before: DeviceSession | undefined, switching: boolean) {
  if (local.binding && !switching) {
    const verifier = await getItem<{ salt: string; hash: string }>("verifier");
    if (!verifier || !(await checkCode(root, verifier))) throw new Error("Sign-in changed. Your saved accounts are kept; try again.");
    await unlockDevice(root, local.binding);
  } else {
    if (local.binding && !before?.signedOut) throw new Error("Sign out before switching accounts.");
    const generation = local.binding ? before?.generation : await claimEmptyPasswordDevice(before?.generation);
    await restoreOtherAccount(root, { generation, userId: envelope.owner, ...(switching ? { retained: local.switchGuard } : {}) }, !local.binding);
  }
  const fresh = await passwordUnlockContext();
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (!fresh.binding || !verifier || !(await checkCode(root, verifier))) throw new Error("Your saved account changed. Sign in again.");
  await savePasswordUnlock(envelope, fresh.binding);
  notifyDeviceSession();
}
function sameRetained(actual: RetainedAccount | undefined, expected: RetainedAccount) {
  return actual?.vaultId === expected.vaultId && actual.generation === expected.generation && actual.records === expected.records;
}
export async function signInPassword(username: string, password: string, replaceExisting = false, consent?: RetainedAccount) {
  const name = loginTag(username);
  if (!validLoginTag(name) || !password || password.length > 256) throw new Error("Gamertag or password is incorrect.");
  let before = await readDeviceSession(); let local = await passwordUnlockContext();
  if (consent && !sameRetained(local.switchGuard, consent)) throw new Error("Your saved account changed. Review it and sign in again.");
  const envelope = await signInEnvelope(name, password, before, local);
  const root = await unwrapPasswordRoot(envelope, name, password);
  let current = await readDeviceSession();
  if (current?.generation !== before?.generation || !!current?.signedOut !== !!before?.signedOut) throw new Error("Device session changed. Try signing in again.");
  const fresh = await passwordUnlockContext();
  if (local.switchGuard && !sameRetained(fresh.switchGuard, local.switchGuard)) throw new Error("Your saved account changed. Review it and sign in again.");
  const verifier = local.binding ? await getItem<{ salt: string; hash: string }>("verifier") : undefined;
  const switching = !!local.binding && (!verifier || !(await checkCode(root, verifier)));
  if (switching && (!replaceExisting || !local.canReplace)) throw new AccountSwitchRequired(local.switchGuard!, local.canReplace);
  if (switching && !navigator.onLine) throw new Error("Connect to the internet to restore this account.");
  if (switching && !before?.signedOut) {
    await signOutDevice();
    before = await readDeviceSession();
    const after = await passwordUnlockContext();
    if (after.switchGuard?.vaultId !== local.switchGuard!.vaultId || after.switchGuard.records !== local.switchGuard!.records || !after.canReplace) throw new Error("Your saved account changed. Review it and sign in again.");
    local = after;
  }
  if (navigator.onLine) {
    const signed = await signInEnvelope(name, password, before, local, envelope);
    if (JSON.stringify(signed) !== JSON.stringify(envelope)) throw new Error("Sign-in changed. Your saved accounts are kept; try again.");
  }
  current = await readDeviceSession();
  if (current?.generation !== before?.generation || !!current?.signedOut !== !!before?.signedOut) throw new Error("Device session changed. Try signing in again.");
  const latest = await passwordUnlockContext();
  if (local.switchGuard && (!sameRetained(latest.switchGuard, local.switchGuard) || (switching && !latest.canReplace))) throw new Error("Your saved account changed. Review it and sign in again.");
  if (!local.binding && latest.binding) throw new Error("This browser already has an account. Review it and sign in again.");
  await openPasswordAccount(root, envelope, local, before, switching);
}
