import * as C from "./crypto";
import { getItem, setItem } from "./db";
import { safeFetch } from "./worker-safety";

export interface RecoveryRecord { locator: string; envelope: C.BackupFile }
export const isAlternativeCode = (code: string) => C.normaliseCode(code).startsWith("DRIP2");
export async function recoveryLocator(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`drip-alternative-recovery-v1:${C.normaliseCode(code)}`));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function createRecoveryCodes(root: string) {
  const codes = Array.from({ length: 6 }, () => `DRIP2-${C.generateRecoveryCode()}`);
  const records = await Promise.all(codes.map(async code => ({ locator: await recoveryLocator(code), envelope: await C.encryptBackup({ purpose: "drip-recovery-root-v1", root }, code) })));
  return { codes, records };
}
export async function resolveRecoveryCode(code: string): Promise<string> {
  if (!isAlternativeCode(code)) return code;
  if (!C.isValidCode(code)) throw new Error("Enter your complete recovery code.");
  const locator = await recoveryLocator(code);
  const cached = await getItem<RecoveryRecord[]>("recoveryRecords");
  let record = cached?.find(r => r.locator === locator);
  if (!record) {
    const response = await safeFetch("/api/recovery-codes", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locator }) });
    if (!response.ok) throw new Error("Recovery code not found. Check the code and your connection.");
    record = { locator, envelope: (await response.json()).envelope };
  }
  const value = await C.decryptBackup<{ purpose: string; root: string }>(record.envelope, code);
  if (value.purpose !== "drip-recovery-root-v1" || !C.isValidCode(value.root) || isAlternativeCode(value.root)) throw new Error("Invalid recovery code.");
  // Keep only encrypted wrappers so this code can also unlock this device offline.
  await setItem("recoveryRecords", [...(cached ?? []).filter(r => r.locator !== locator), record].slice(-12));
  return value.root;
}
export async function registerRecoveryCodes(records: RecoveryRecord[], ownerId: string, signal?: AbortSignal) {
  const response = await safeFetch("/api/recovery-codes", { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Drip-Owner": ownerId }, body: JSON.stringify({ records }), signal });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.code === "RECOVERY_CODES_EXIST" ? "Your original recovery codes are already set up. Use your saved recovery file; another set cannot be created." : "Could not save your original recovery codes. Keep this browser signed in and retry when connected.");
  }
  const replaced = new Set(records.map(record => record.locator)); try { const cached = await getItem<RecoveryRecord[]>("recoveryRecords"); await setItem("recoveryRecords", [...(cached ?? []).filter(old => !replaced.has(old.locator)), ...records].slice(-12)); return true; } catch { return false; }
}
export function downloadRecoveryCodes(codes: string[], handle?: string) {
  const heading = handle ? `DRIP RECOVERY CODES\nGamertag: ${handle}` : "DRIP RECOVERY CODES";
  const numberedCodes = codes.map((code, i) => `${i + 1}. ${code}`).join("\n");
  const content = [
    heading, "", numberedCodes, "",
    "Keep this file private, away from your device. Anyone with one code can recover your encrypted cloud accounts.",
    "Each code can be reused. Your gamertag alone cannot recover your data.",
    "Cloud recovery must be enabled first. Otherwise your original code only unlocks encrypted file backups. Codes recover the latest successfully synced cloud copy; offline changes must sync first.",
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "drip-recovery-codes.txt"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
