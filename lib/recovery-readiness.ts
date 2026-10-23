import { getItem, loadData, passkeyUnlockContext, setItem } from "./db";
import { hasPasskeyUnlock } from "./passkey-unlock";

type Receipt = { vaultId: string; savedAt: string };
export async function recoveryReadiness() {
  const { binding } = await passkeyUnlockContext();
  const receipt = await getItem<Receipt>("recoveryCodesSaved");
  return { passkey: await hasPasskeyUnlock(), codesSaved: receipt?.vaultId === binding.vaultId && typeof receipt.savedAt === "string" };
}
export async function confirmRecoveryCodesSaved(expectedVaultId: string | undefined) {
  await loadData();
  const { binding } = await passkeyUnlockContext();
  if (!expectedVaultId || binding.vaultId !== expectedVaultId) throw new Error("Your account changed. Create recovery codes for the current account.");
  await setItem("recoveryCodesSaved", { vaultId: binding.vaultId, savedAt: new Date().toISOString() } satisfies Receipt);
  window.dispatchEvent(new Event("drip-recovery-changed"));
}
