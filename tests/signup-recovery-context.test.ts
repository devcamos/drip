import { expect, it } from "vitest";
import { codeVerifier, deriveCloudEncryptionKey } from "../lib/crypto";
import { wrapPasswordRoot } from "../lib/password-crypto";
import { commitCloudRestore, emptyData, getItem, lockLocalVault, saveRecoveryCodesConfirmation, setItem, signupRecoveryContext, unlockLocalVault } from "../lib/db";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

const password = "Synthetic river meadow 42!";
const identity = { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "now" };
const data = { ...emptyData(), identity };
async function signup() {
  const state = { userId: "owner", identityId: identity.id, key: await deriveCloudEncryptionKey(fixtureCode), version: 1, dirty: false, lastSyncAt: "now", generation: "cloud", revision: 0 };
  const envelope = await wrapPasswordRoot(fixtureCode, identity.handle, password, state.userId);
  await commitCloudRestore(data, state, await codeVerifier(fixtureCode), undefined, undefined, fixtureCode, envelope);
}

it("uses the current signup key in memory without persisting a password or plaintext recovery key", async () => {
  await signup();
  const context = await signupRecoveryContext();
  expect(context).toMatchObject({ root: fixtureCode, ownerId: "owner" });
  const stored = JSON.stringify(await rawStore());
  expect(stored).not.toContain(fixtureCode); expect(stored).not.toContain(password);
  await expect(saveRecoveryCodesConfirmation("other-vault")).rejects.toThrow(/changed/);
  expect(await signupRecoveryContext()).toEqual(context);
  await saveRecoveryCodesConfirmation(context.vaultId);
  expect(await getItem("signupRecoveryRequired")).toBeUndefined();
  await expect(signupRecoveryContext()).rejects.toThrow(/Sign in again/);
});

it("drops access on lock/sign-out and resumes an unfinished signup after ordinary unlock", async () => {
  await signup(); const context = await signupRecoveryContext();
  lockLocalVault(true);
  await expect(signupRecoveryContext()).rejects.toThrow(/Unlock/);
  await unlockLocalVault(fixtureCode);
  expect(await signupRecoveryContext()).toEqual(context);
  await setItem("deviceSession", { signedOut: true, generation: "out" });
  await expect(signupRecoveryContext()).rejects.toThrow(/Unlock/);
});

it("does not open signup codes for an unrelated checkpoint or after an account replacement", async () => {
  await signup();
  await setItem("signupRecoveryRequired", { vaultId: "unrelated-vault" });
  await expect(signupRecoveryContext()).rejects.toThrow(/Sign in again/);
  await seedVault(data);
  await expect(signupRecoveryContext()).rejects.toThrow(/Sign in again/);
});
