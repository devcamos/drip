import { isValidCode } from "./crypto";
import { decode, encode } from "./passkey-crypto";

export const loginTag = (value: string) => value.trim().toLowerCase();
export const validLoginTag = (value: string) => /^[a-z0-9_]{3,16}$/.test(value);
export const passwordError = (password: string) => password.length < 12 ? "Use a password with at least 12 characters." : password.length > 256 ? "Use 256 characters or fewer." : null;
export interface PasswordWrap {
  app: "drip-password"; v: 1; username: string; owner: string;
  iter: 600000; salt: string; iv: string; ct: string;
}
const text = new TextEncoder();
const aad = (wrap: Omit<PasswordWrap, "iv" | "ct">) => text.encode(JSON.stringify([wrap.app, wrap.v, wrap.username, wrap.owner, wrap.iter, wrap.salt]));
export function validPasswordWrap(value: unknown): value is PasswordWrap {
  const w = value as PasswordWrap;
  try {
    return w?.app === "drip-password" && w.v === 1 && validLoginTag(w.username) && typeof w.owner === "string" && w.owner.length > 0 && w.owner.length < 128 && w.iter === 600000 &&
      decode(w.salt).length === 16 && decode(w.iv).length === 12 && decode(w.ct).length > 16 && decode(w.ct).length < 256;
  } catch { return false; }
}
async function key(password: string, wrap: PasswordWrap | Omit<PasswordWrap, "iv" | "ct">) {
  // Preserve password case, spaces and punctuation. Recovery-code normalization
  // must never be applied to a human password.
  const raw = text.encode(password);
  try {
    const material = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: decode(wrap.salt), iterations: wrap.iter }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } finally { raw.fill(0); }
}
/** Domain separation: neither the password nor the encryption root reaches auth. */
export async function passwordProof(username: string, password: string): Promise<string> {
  const bytes = text.encode(JSON.stringify(["drip-password-auth-v1", loginTag(username), password]));
  try { return encode(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))); }
  finally { bytes.fill(0); }
}
export async function wrapPasswordRoot(root: string, username: string, password: string, owner: string): Promise<PasswordWrap> {
  const error = passwordError(password); if (error) throw new Error(error);
  if (!isValidCode(root) || !validLoginTag(loginTag(username))) throw new Error("Invalid sign-in setup.");
  const header = { app: "drip-password" as const, v: 1 as const, username: loginTag(username), owner, iter: 600000 as const, salt: encode(crypto.getRandomValues(new Uint8Array(16))) };
  const iv = crypto.getRandomValues(new Uint8Array(12)); const plain = text.encode(root);
  try {
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(header) }, await key(password, header), plain);
    return { ...header, iv: encode(iv), ct: encode(new Uint8Array(ct)) };
  } finally { plain.fill(0); }
}
export async function unwrapPasswordRoot(value: unknown, username: string, password: string): Promise<string> {
  if (!validPasswordWrap(value) || value.username !== loginTag(username)) throw new Error("Gamertag or password is incorrect.");
  let plain: Uint8Array | undefined;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(value.iv), additionalData: aad(value) }, await key(password, value), decode(value.ct)));
    const root = new TextDecoder().decode(plain);
    if (!isValidCode(root)) throw new Error("Invalid unlock key.");
    return root;
  } catch { throw new Error("Gamertag or password is incorrect."); }
  finally { plain?.fill(0); }
}
