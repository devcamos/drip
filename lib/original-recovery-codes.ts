import * as C from "./crypto";
import { getItem, loadData, passwordUnlockContext, rememberOriginalRecoveryCodes, type VaultBinding } from "./db";
import { createRecoveryCodes, recoveryLocator, registerRecoveryCodes, type RecoveryRecord } from "./recovery-codes";
import { safeFetch } from "./worker-safety";

type Original = { purpose: "drip-original-codes-v1"; ownerId: string; codes: string[]; records: RecoveryRecord[] };
const unavailable = "Your original recovery codes are already set up. Use the file you saved when they were issued. Another set cannot be created.";

async function unchanged(expected: VaultBinding) {
  await loadData();
  const { binding } = await passwordUnlockContext();
  if (binding?.vaultId !== expected.vaultId || binding.generation !== expected.generation) throw new Error("Your account changed. Sign in again.");
}

/** Issue once; retry or download the same encrypted local original, never rotate. */
export async function originalRecoveryCodes(root: string, ownerId: string, signal = AbortSignal.timeout(8000)) {
  signal.throwIfAborted();
  // Bound the caller even when safeFetch is waiting for another tab's private
  // request lock. The queued fetch retains this signal and cannot send later.
  return new Promise<Awaited<ReturnType<typeof prepareOriginal>>>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void prepareOriginal(root, ownerId, signal).then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

async function prepareOriginal(root: string, ownerId: string, signal: AbortSignal) {
  await loadData();
  const { binding } = await passwordUnlockContext();
  const verifier = await getItem<{ salt: string; hash: string }>("verifier");
  if (!binding || !verifier || !(await C.checkCode(root, verifier))) throw new Error("Confirm the password or recovery code for this account.");
  const response = await safeFetch("/api/recovery-codes", { method: "GET", credentials: "same-origin", cache: "no-store", headers: { "X-Drip-Owner": ownerId }, signal });
  if (!response.ok) throw new Error("Could not check your original recovery codes. Keep this browser signed in and retry when connected.");
  const { locators } = await response.json();
  if (locators !== null && (!Array.isArray(locators) || locators.length !== 6 || !locators.every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)))) throw new Error("Invalid recovery status. Try again.");
  let stored = await getItem<C.BackupFile>(`originalRecoveryCodes:${ownerId}`);
  if (!stored) {
    if (locators) throw new Error(unavailable);
    const created = await createRecoveryCodes(root);
    const envelope = await C.encryptBackup({ purpose: "drip-original-codes-v1", ownerId, ...created } satisfies Original, root);
    // Persist before the request: a lost response or closed screen must not lose
    // the only copy or cause a retry to generate a different set.
    stored = await rememberOriginalRecoveryCodes(ownerId, envelope, binding);
  }
  const original = await C.decryptBackup<Original>(stored, root);
  if (original.purpose !== "drip-original-codes-v1" || original.ownerId !== ownerId || original.codes.length !== 6 || original.records.length !== 6 || !original.codes.every(C.isValidCode)) throw new Error("Could not open your original recovery file.");
  const hashes = await Promise.all(original.codes.map(recoveryLocator));
  if (!hashes.every((hash, index) => original.records[index].locator === hash)) throw new Error("Could not verify your original recovery file.");
  if (locators && !hashes.every(hash => locators.includes(hash))) throw new Error(unavailable);
  await unchanged(binding);
  signal.throwIfAborted();
  const cached = await registerRecoveryCodes(original.records, ownerId, signal);
  await unchanged(binding);
  return { codes: original.codes, cached, vaultId: binding.vaultId };
}
