import { beforeEach, expect, it, vi } from "vitest";
const cloud = vi.hoisted(() => ({ connect: vi.fn(), readCloudState: vi.fn(), syncNow: vi.fn(), vault: vi.fn(), writeCloudState: vi.fn(), recoveryCredentials: vi.fn(), seal: vi.fn(), authClient: { signOut: vi.fn() }, restoreCloud: vi.fn() }));
const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/cloud", () => cloud);
vi.mock("../lib/worker-safety", () => ({ safeFetch: request }));
import { signUpPassword, passwordUsername } from "../lib/password-login";
import { cloudSnapshot, commitCloudRestore, completeDeviceSession, emptyData, getItem, loadData, reserveSignupReplacement, setItem, unlockLocalVault } from "../lib/db";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
import { wrapPasswordRoot } from "../lib/password-crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
const identity = { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "original", createdAt: "2026-10-20" };
const original = { ...emptyData(), identity, lastBackupAt: "original-only-value" };
const fresh = { ...emptyData(), identity: { ...identity, id: "8f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a11", handle: "new_account" } };
const password = "Synthetic meadow 2026!";
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true });
  await seedVault(original, fixtureCode, { userId: "old-owner", identityId: identity.id, key: {} as CryptoKey, version: 3, dirty: false, lastSyncAt: "2026-10-20", generation: "old-connection", revision: 2 });
  await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "old-out" });
  cloud.connect.mockResolvedValue({ user: { id: "new-owner" }, key: {} });
  cloud.vault.mockImplementation(async (method: string) => method === "GET" ? { version: 0, envelope: null } : { version: 1 });
  cloud.seal.mockResolvedValue({ app: "drip-cloud", v: 1, ct: "synthetic" });
  cloud.recoveryCredentials.mockResolvedValue({ password: "a".repeat(64) });
  cloud.authClient.signOut.mockResolvedValue({ error: null }); request.mockResolvedValue(Response.json({ saved: true }));
});
it("keeps the old ciphertext until registration completes and atomically opens only the empty new account", async () => {
  const before = await rawStore();
  request.mockImplementationOnce(async (_path: unknown, init: RequestInit) => {
    const stillOld = await rawStore(); expect(stillOld.data).toEqual(before.data); expect(stillOld.localVault).toEqual(before.localVault);
    expect(stillOld.deviceSession.signedOut).toBe(true);
    const headers = new Headers(init.headers); expect(headers.get("X-Drip-Signup")).toBe(stillOld.deviceSession.signupNonce);
    expect(headers.get("X-Drip-Resume")).toBe(stillOld.deviceSession.generation);
    return Response.json({ saved: true });
  });
  await signUpPassword("new_account", password, fresh, true);
  expect(await loadData()).toEqual(fresh); expect(await passwordUsername()).toBe("new_account");
  expect((await cloudSnapshot()).state?.userId).toBe("new-owner");
  expect(cloud.seal).toHaveBeenCalledWith(fresh, expect.anything());
  const after = await rawStore(); expect(after.deviceSession).toMatchObject({ signedOut: false, remotePending: false });
  expect(after.deviceSession).not.toHaveProperty("signupNonce"); expect(JSON.stringify(after)).not.toContain(password);
});
it.each(["registration", "duplicate-name", "local-write"])("preserves the old account on %s failure", async failure => {
  const before = await rawStore();
  if (failure === "registration") cloud.connect.mockRejectedValueOnce(new Error("Registration unavailable"));
  if (failure === "duplicate-name") request.mockResolvedValueOnce(Response.json({ message: "Gamertag is taken" }, { status: 409 }));
  if (failure === "local-write") request.mockImplementationOnce(async () => { await rawStore({ cloudState: { ...before.cloudState, revision: 3, dirty: true } }); return Response.json({ saved: true }); });
  await expect(signUpPassword("new_account", password, fresh, true)).rejects.toThrow();
  const after = await rawStore();
  for (const key of ["data", "localVault", "verifier", "passwordUnlock", "passkeyUnlock"]) expect(after[key]).toEqual(before[key]);
  expect(after.deviceSession.signedOut).toBe(true); expect(after.deviceSession).not.toHaveProperty("signupNonce");
  await unlockLocalVault(fixtureCode); await completeDeviceSession(after.deviceSession.generation, { ...after.deviceSession, signedOut: false });
  expect(await loadData()).toEqual(original);
});
it.each(["unsynced", "device-only"])("blocks replacement of %s records before sending credentials", async kind => {
  const before = await rawStore();
  await rawStore({ cloudState: kind === "device-only" ? undefined : { ...before.cloudState, dirty: true } });
  await expect(signUpPassword("new_account", password, fresh, true)).rejects.toThrow(/sync your current account/);
  expect(cloud.connect).not.toHaveBeenCalled(); expect((await rawStore()).data).toEqual(before.data);
});
it("does not sign out a later tab's session when delayed registration fails", async () => {
  cloud.connect.mockImplementationOnce(async () => {
    await setItem("deviceSession", { signedOut: false, remotePending: false, generation: "later-tab" });
    throw new Error("Registration interrupted");
  });
  await expect(signUpPassword("new_account", password, fresh, true)).rejects.toThrow(/interrupted/);
  expect(cloud.authClient.signOut).not.toHaveBeenCalled();
  expect(await getItem("deviceSession")).toMatchObject({ signedOut: false, generation: "later-tab" });
});
it("retains the original account when replacement was not explicitly requested", async () => {
  await expect(signUpPassword("new_account", password, fresh)).rejects.toThrow(/already has an account/);
  expect(cloud.connect).not.toHaveBeenCalled();
});
it.each(["reservation", "vault-header", "verifier", "password-wrapper", "passkey-wrapper"])("keeps the old encrypted account if its %s changes during signup encryption", async changed => {
  const replacement = await reserveSignupReplacement();
  const root = generateRecoveryCode();
  const wrap = await wrapPasswordRoot(root, "new_account", password, "new-owner");
  const verifier = await codeVerifier(root);
  const before = await rawStore();
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
    const cipher = await encrypt(...args);
    if (changed === "reservation") await completeDeviceSession(replacement.generation, { signedOut: true, remotePending: false, generation: replacement.generation });
    if (changed === "vault-header") await rawStore({ localVault: { ...before.localVault, changed: true } });
    if (changed === "verifier") await rawStore({ verifier: { salt: "changed", hash: "changed" } });
    if (changed === "password-wrapper") await rawStore({ passwordUnlock: { vaultId: before.localVault.id, envelope: { ct: "changed" } } });
    if (changed === "passkey-wrapper") await rawStore({ passkeyUnlock: { vaultId: before.localVault.id, ct: "changed" } });
    return cipher;
  });
  try {
    await expect(commitCloudRestore(fresh, { userId: "new-owner", identityId: fresh.identity.id, key: {} as CryptoKey, version: 1, dirty: false, lastSyncAt: null, generation: "new-cloud", revision: 0 }, verifier, replacement.generation, replacement.generation, root, wrap, replacement)).rejects.toThrow(/current account changed/);
  } finally { spy.mockRestore(); }
  const after = await rawStore();
  expect(after.data).toEqual(before.data); expect(after.cloudState).toEqual(before.cloudState);
  if (changed !== "vault-header") expect(after.localVault).toEqual(before.localVault);
  if (changed !== "verifier") expect(after.verifier).toEqual(before.verifier);
  if (changed !== "password-wrapper") expect(after.passwordUnlock).toEqual(before.passwordUnlock);
  if (changed !== "passkey-wrapper") expect(after.passkeyUnlock).toEqual(before.passkeyUnlock);
  expect(after.deviceSession.signedOut).toBe(true);
  await expect(loadData()).rejects.toThrow();
});
