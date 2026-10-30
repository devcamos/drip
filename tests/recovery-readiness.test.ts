import { beforeEach, expect, it, vi } from "vitest";
import { confirmRecoveryCodesSaved, recoveryReadiness } from "../lib/recovery-readiness";
import { commitCloudRestore, emptyData, lockLocalVault, passkeyUnlockContext } from "../lib/db";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import { codeVerifier } from "../lib/crypto";

beforeEach(async () => { vi.stubGlobal("window", { dispatchEvent: vi.fn() }); await seedVault(); });
it("only completes saved-code setup for this vault and persists no recovery material", async () => {
  expect(await recoveryReadiness()).toEqual({ passkey: false, codesSaved: false });
  const { binding } = await passkeyUnlockContext();
  await expect(confirmRecoveryCodesSaved(undefined)).rejects.toThrow(/changed/);
  await expect(confirmRecoveryCodesSaved("previous-account")).rejects.toThrow(/changed/);
  await confirmRecoveryCodesSaved(binding.vaultId);
  expect((await recoveryReadiness()).codesSaved).toBe(true);
  const saved = (await rawStore()).recoveryCodesSaved;
  expect(Object.keys(saved).sort()).toEqual(["savedAt", "vaultId"]);
  expect(JSON.stringify(saved)).not.toContain(fixtureCode);
  await commitCloudRestore(emptyData(), undefined, await codeVerifier(fixtureCode), binding.generation, undefined, fixtureCode);
  expect((await recoveryReadiness()).codesSaved).toBe(false);
});
it("cannot confirm recovery setup while the local data is locked", async () => {
  const { binding } = await passkeyUnlockContext(); lockLocalVault();
  await expect(confirmRecoveryCodesSaved(binding.vaultId)).rejects.toThrow(/Unlock/);
  expect((await rawStore()).recoveryCodesSaved).toBeUndefined();
});
