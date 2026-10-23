import { checkCode } from "./crypto";
import { getItem, loadData, passkeyUnlockContext, savePasskeyUnlock } from "./db";
import { unlockDevice } from "./device-session";
import { resolveRecoveryCode } from "./recovery-codes";
import { decode, encode, unwrapRoot, validWrap, wrapRoot, type PasskeyWrap } from "./passkey-crypto";

type Credentials = Pick<CredentialsContainer, "create" | "get">;
type PRFExtensions = AuthenticationExtensionsClientInputs & { prf: { eval: { first: Uint8Array<ArrayBuffer> } } };
type PRFResult = AuthenticationExtensionsClientOutputs & { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
const unsupported = () => new Error("Your browser or password manager does not support encrypted passkey unlock. Your recovery codes still work.");
const extensions = (salt: string): PRFExtensions => ({ prf: { eval: { first: decode(salt) } } });

async function secretFor(creds: Credentials, wrap: Pick<PasskeyWrap, "salt" | "credentialId" | "rpId">): Promise<Uint8Array> {
  if (!creds?.get) throw unsupported();
  const credential = await creds.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: wrap.rpId, userVerification: "required", timeout: 60_000,
    allowCredentials: [{ type: "public-key", id: decode(wrap.credentialId) }], extensions: extensions(wrap.salt),
  } }) as PublicKeyCredential | null;
  if (!credential || encode(new Uint8Array(credential.rawId)) !== wrap.credentialId) throw new Error("That passkey does not match this device's encrypted accounts. Use a recovery code.");
  const result = credential.getClientExtensionResults() as PRFResult;
  const secret = result.prf?.results?.first;
  if (secret?.byteLength !== 32) throw unsupported();
  return new Uint8Array(secret);
}

export async function hasPasskeyUnlock() {
  try {
    const { wrap } = await passkeyUnlockContext();
    return !!wrap && validWrap(wrap, location.origin, location.hostname) && !!navigator.credentials?.get;
  } catch { return false; }
}

/** The password manager keeps the passkey; IndexedDB keeps only its encrypted root wrapper. */
export async function enablePasskeyUnlock(code: string, name: string, creds: Credentials = navigator.credentials) {
  if (!creds?.create || !creds.get) throw unsupported();
  const { binding } = await passkeyUnlockContext();
  const root = await resolveRecoveryCode(code);
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (!verifier || !(await checkCode(root, verifier))) throw new Error("That isn't your recovery code.");
  const header = {
    app: "drip-passkey-unlock" as const, v: 1 as const, vaultId: binding.vaultId,
    origin: location.origin, rpId: location.hostname, salt: encode(crypto.getRandomValues(new Uint8Array(32))),
  };
  const credential = await creds.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Drip", id: header.rpId },
    user: { id: crypto.getRandomValues(new Uint8Array(32)), name, displayName: `Drip unlock · ${name}` },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { userVerification: "required", residentKey: "required" },
    attestation: "none", timeout: 60_000, extensions: extensions(header.salt),
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey setup was cancelled. Your recovery codes still work.");
  const identity = { ...header, credentialId: encode(new Uint8Array(credential.rawId)) };
  // Always perform a get(), proving this saved credential actually supplies a PRF
  // result. A browser may create a normal passkey while ignoring the extension.
  const secret = await secretFor(creds, identity);
  try {
    const wrap = await wrapRoot(root, secret, identity);
    if (await unwrapRoot(wrap, secret, header.origin, header.rpId) !== root) throw new Error("Could not verify passkey encryption.");
    await savePasskeyUnlock(wrap, binding);
  } finally { secret.fill(0); }
}

export async function unlockWithPasskey(creds: Credentials = navigator.credentials) {
  const { wrap, binding } = await passkeyUnlockContext();
  if (!wrap || !validWrap(wrap, location.origin, location.hostname)) throw new Error("Set up passkey unlock in Settings after signing in with your password or a recovery code.");
  const secret = await secretFor(creds, wrap);
  try {
    const root = await unwrapRoot(wrap, secret, location.origin, location.hostname);
    await unlockDevice(root, binding);
  } finally { secret.fill(0); }
}

/** Fresh user verification before changing credentials on an already unlocked device.
 * No root or PRF result is persisted. Recheck the vault, session and wrapper after
 * the password-manager prompt so another tab cannot change the account beneath it.
 */
export async function passkeyRecoveryRoot(creds: Credentials = navigator.credentials) {
  await loadData();
  const { wrap, binding } = await passkeyUnlockContext();
  if (!wrap || !validWrap(wrap, location.origin, location.hostname)) throw new Error("Set up passkey unlock on this browser first.");
  const secret = await secretFor(creds, wrap);
  try {
    const root = await unwrapRoot(wrap, secret, location.origin, location.hostname);
    const fresh = await passkeyUnlockContext();
    if (fresh.binding.vaultId !== binding.vaultId || fresh.binding.generation !== binding.generation || JSON.stringify(fresh.wrap) !== JSON.stringify(wrap)) throw new Error("Device session changed. Unlock Drip again before continuing.");
    const verifier = await getItem<{ salt: string; hash: string }>("verifier");
    if (!verifier || !(await checkCode(root, verifier))) throw new Error("Passkey does not match your saved account.");
    await loadData();
    return root;
  } finally { secret.fill(0); }
}
export async function disablePasskeyUnlock() {
  const { binding } = await passkeyUnlockContext();
  await savePasskeyUnlock(undefined, binding);
}
