import { decryptBackup, encryptBackup, deriveCloudEncryptionKey, isValidCode, type BackupFile } from "./crypto";
import type { AppData } from "./types";
import { fromStoredPence, hasPenceMarker, toStoredPence } from "./money-storage";

export interface VaultHeader { app: "drip-local-vault"; v: 1; id: string; wrappedKey: BackupFile }
export interface LocalEnvelope { app: "drip-local-data"; v: 1 | 2; iv: string; ct: string }
export interface LocalKeys { header: VaultHeader; dataKey: CryptoKey; cloudKey: CryptoKey }
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCodePoint(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.codePointAt(0)!);
const importKey = (bytes: Uint8Array) => crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function createVault(root: string): Promise<LocalKeys> {
  if (!isValidCode(root)) throw new Error("Enter your complete recovery code.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  try {
    const id = crypto.randomUUID();
    const wrappedKey = await encryptBackup({ purpose: "drip-local-key-v1", id, key: b64(bytes) }, root);
    return { header: { app: "drip-local-vault", v: 1, id, wrappedKey }, dataKey: await importKey(bytes), cloudKey: await deriveCloudEncryptionKey(root) };
  } finally { bytes.fill(0); }
}

export async function openVault(header: VaultHeader, root: string): Promise<LocalKeys> {
  if (header.app !== "drip-local-vault" || header.v !== 1 || !header.id) throw new Error("Unsupported local vault. Your stored copy has not changed.");
  const value = await decryptBackup<{ purpose: string; id: string; key: string }>(header.wrappedKey, root);
  if (value.purpose !== "drip-local-key-v1" || value.id !== header.id || typeof value.key !== "string") throw new Error("Invalid local key.");
  const bytes = unb64(value.key);
  try {
    if (bytes.length !== 32) throw new Error("Invalid local key.");
    return { header, dataKey: await importKey(bytes), cloudKey: await deriveCloudEncryptionKey(root) };
  } finally { bytes.fill(0); }
}

export async function encryptLocal(value: unknown, keys: LocalKeys): Promise<LocalEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const stored = isAppData(value) ? toStoredPence(value) : value;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`drip-local-data-v2:${keys.header.id}`) }, keys.dataKey, enc.encode(JSON.stringify(stored)));
  // Avoid spreading account-sized arrays into a function call.
  let encoded = "";
  for (const byte of new Uint8Array(ct)) { encoded += String.fromCodePoint(byte); }
  return { app: "drip-local-data", v: 2, iv: b64(iv), ct: btoa(encoded) };
}

export async function decryptLocal<T>(value: LocalEnvelope, keys: LocalKeys): Promise<T> {
  if (value?.app !== "drip-local-data" || (value.v !== 1 && value.v !== 2)) throw new Error("Invalid encrypted local data.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(value.iv), additionalData: enc.encode(`drip-local-data-v${value.v}:${keys.header.id}`) }, keys.dataKey, unb64(value.ct));
  const decoded: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (value.v === 2 && isAppData(decoded)) {
    if (!hasPenceMarker(decoded)) throw new Error("Invalid encrypted local money format.");
    return fromStoredPence(decoded) as T;
  }
  if (value.v === 1 && hasPenceMarker(decoded)) throw new Error("Unsupported encrypted local money format.");
  return decoded as T;
}

function isAppData(value: unknown): value is AppData {
  return !!value && typeof value === "object" && "version" in value && value.version === 1 && "accounts" in value && Array.isArray(value.accounts) && "snapshots" in value && Array.isArray(value.snapshots) && "lastBackupAt" in value;
}
