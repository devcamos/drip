/**
 * Encrypted backups. The recovery code is the root key:
 * PBKDF2-SHA256 (600k iterations, random 16-byte salt) -> AES-256-GCM (random 12-byte IV).
 */
export const KDF_ITERATIONS = 600_000;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (u: Uint8Array) => { let s = ""; u.forEach((c) => (s += String.fromCharCode(c))); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** 24 random characters (~119 bits) in groups of 4: ABCD-EFGH-... */
export function generateRecoveryCode(): string {
  const out: string[] = [];
  const max = 256 - (256 % ALPHABET.length);
  while (out.length < 24) {
    const buf = crypto.getRandomValues(new Uint8Array(32));
    for (const b of buf) if (b < max && out.length < 24) out.push(ALPHABET[b % ALPHABET.length]);
  }
  return out.join("").match(/.{4}/g)!.join("-");
}

/** Uppercase, strip spaces/dashes so typing variations still work. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  const normal = normaliseCode(code);
  const n = normal.startsWith("DRIP2") ? normal.slice(5) : normal;
  return n.length === 24 && [...n].every((c) => ALPHABET.includes(c));
}

async function deriveKey(code: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(normaliseCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export interface BackupFile { app: "drip"; v: 1; kdf: "PBKDF2-SHA256"; iter: number; salt: string; iv: string; ct: string }

/** Shared by cloud recovery and the memory-only cloud key restored at local unlock. */
export async function deriveCloudEncryptionKey(code: string): Promise<CryptoKey> {
  if (!isValidCode(code)) throw new Error("Enter your complete recovery code.");
  return deriveKey(code, enc.encode("drip-cloud-encryption-v1"), KDF_ITERATIONS);
}

export async function encryptBackup(data: unknown, code: string, iterations = KDF_ITERATIONS): Promise<BackupFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("drip-v1") }, key, enc.encode(JSON.stringify(data))));
  return { app: "drip", v: 1, kdf: "PBKDF2-SHA256", iter: iterations, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export class BackupError extends Error {}

export async function decryptBackup<T = unknown>(file: unknown, code: string): Promise<T> {
  const f = file as BackupFile;
  if (!f || f.app !== "drip" || f.v !== 1 || f.kdf !== "PBKDF2-SHA256") throw new BackupError("This isn't a Drip backup file.");
  if (!Number.isInteger(f.iter) || f.iter < 100_000 || f.iter > KDF_ITERATIONS) throw new BackupError("Backup uses unsafe settings.");
  try {
    const key = await deriveKey(code, unb64(f.salt), f.iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(f.iv), additionalData: enc.encode("drip-v1") }, key, unb64(f.ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new BackupError("Wrong recovery code, or the file is damaged.");
  }
}

/** Salted SHA-256 verifier so the app can check a typed code without storing it. */
export async function codeVerifier(code: string, salt?: string): Promise<{ salt: string; hash: string }> {
  const s = salt ? unb64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...s, ...enc.encode(normaliseCode(code))])));
  return { salt: b64(s), hash: b64(h) };
}

export async function checkCode(code: string, v: { salt: string; hash: string }): Promise<boolean> {
  return (await codeVerifier(code, v.salt)).hash === v.hash;
}
