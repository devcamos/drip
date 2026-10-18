import { isValidCode } from "./crypto";

export interface PasskeyWrap {
  app: "drip-passkey-unlock"; v: 1; vaultId: string; origin: string; rpId: string;
  credentialId: string; salt: string; iv: string; ct: string;
}
export const encode = (bytes: Uint8Array) => btoa(String.fromCodePoint(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const decode = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
const text = new TextEncoder();
type Header = Omit<PasskeyWrap, "iv" | "ct">;
const aad = (h: Header) => text.encode(JSON.stringify([h.app, h.v, h.vaultId, h.origin, h.rpId, h.credentialId, h.salt]));
async function wrappingKey(secret: Uint8Array, h: Header) {
  if (secret.length !== 32) throw new Error("This passkey cannot unlock encrypted data. Use your recovery code.");
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: text.encode("drip-passkey-unlock-v1"), info: aad(h) }, key, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export function validWrap(wrap: PasskeyWrap, origin: string, rpId: string): boolean {
  try {
    return wrap.app === "drip-passkey-unlock" && wrap.v === 1 && !!wrap.vaultId && wrap.origin === origin && wrap.rpId === rpId &&
      typeof wrap.credentialId === "string" && wrap.credentialId.length > 0 && wrap.credentialId.length <= 2048 &&
      decode(wrap.salt).length === 32 && decode(wrap.iv).length === 12 && decode(wrap.ct).length > 16 && decode(wrap.ct).length < 256;
  } catch { return false; }
}
export async function wrapRoot(root: string, secret: Uint8Array, header: Header): Promise<PasskeyWrap> {
  if (!isValidCode(root)) throw new Error("Enter your complete recovery code.");
  const iv = crypto.getRandomValues(new Uint8Array(12)); const plain = text.encode(root);
  try {
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(header) }, await wrappingKey(secret, header), plain);
    return { ...header, iv: encode(iv), ct: encode(new Uint8Array(ct)) };
  } finally { plain.fill(0); }
}
export async function unwrapRoot(wrap: PasskeyWrap, secret: Uint8Array, origin: string, rpId: string): Promise<string> {
  if (!validWrap(wrap, origin, rpId)) throw new Error("Passkey unlock is unavailable here. Use a recovery code and set it up again.");
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(wrap.iv), additionalData: aad(wrap) }, await wrappingKey(secret, wrap), decode(wrap.ct)));
  try {
    const root = new TextDecoder().decode(plain);
    if (!isValidCode(root)) throw new Error("Invalid encrypted unlock key.");
    return root;
  } finally { plain.fill(0); }
}
