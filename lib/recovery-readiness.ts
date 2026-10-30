import { getItem, passkeyUnlockContext, saveRecoveryCodesConfirmation } from "./db";
import { hasPasskeyUnlock } from "./passkey-unlock";

type Receipt = { vaultId: string; savedAt: string };
export async function recoveryReadiness() {
  const { binding } = await passkeyUnlockContext();
  const receipt = await getItem<Receipt>("recoveryCodesSaved");
  return { passkey: await hasPasskeyUnlock(), codesSaved: receipt?.vaultId === binding.vaultId && typeof receipt.savedAt === "string" };
}
export async function confirmRecoveryCodesSaved(expectedVaultId: string | undefined) {
  await saveRecoveryCodesConfirmation(expectedVaultId);
  window.dispatchEvent(new Event("drip-recovery-changed"));
}
