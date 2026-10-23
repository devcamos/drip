import { beforeEach, expect, it, vi } from "vitest";
const cloud = vi.hoisted(() => ({ authClient: { signOut: vi.fn() }, connect: vi.fn() }));
vi.mock("../lib/cloud", () => cloud);
import { enablePasskeyUnlock, disablePasskeyUnlock, hasPasskeyUnlock, unlockWithPasskey, passkeyRecoveryRoot } from "../lib/passkey-unlock";
import { decode, encode, unwrapRoot, wrapRoot } from "../lib/passkey-crypto";
import { commitCloudRestore, emptyData, loadData, lockLocalVault, passkeyUnlockContext, saveData, setItem } from "../lib/db";
import { codeVerifier } from "../lib/crypto";
import { readDeviceSession, signOutDevice, unlockDevice } from "../lib/device-session";
import { createRecoveryCodes } from "../lib/recovery-codes";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "passkey_user", createdAt: "now" } };
const secret = new Uint8Array(32).fill(73); const id = new Uint8Array([1, 2, 3]);
const credential = (value: Uint8Array | undefined = secret, rawId = id) => ({ rawId: rawId.slice().buffer, getClientExtensionResults: () => ({ prf: value ? { results: { first: value.slice().buffer } } : { enabled: false } }) }) as unknown as PublicKeyCredential;
const credentials = () => ({ create: vi.fn(async () => credential()), get: vi.fn(async () => credential()) });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { origin: "https://drip.test", hostname: "drip.test" });
  vi.stubGlobal("navigator", { onLine: false, credentials: credentials() });
  cloud.authClient.signOut.mockResolvedValue({ error: null });
  await seedVault(data);
});

it("reauthenticates a saved passkey to recover the key without a password or code, leaving records unchanged", async () => {
  const creds = credentials();
  await enablePasskeyUnlock(fixtureCode, "passkey_user", creds);
  const before = await rawStore();
  expect(await passkeyRecoveryRoot(creds)).toBe(fixtureCode);
  expect(creds.get).toHaveBeenCalledTimes(2);
  expect(await rawStore()).toEqual(before);
  lockLocalVault();
  await expect(passkeyRecoveryRoot(creds)).rejects.toThrow(/Unlock/);
});

it("does not release a recovery key after cancellation, wrong PRF or a session change during confirmation", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const cancelled = credentials(); cancelled.get.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
  await expect(passkeyRecoveryRoot(cancelled)).rejects.toThrow(/Cancelled/);
  const wrong = credentials(); wrong.get.mockResolvedValueOnce(credential(new Uint8Array(32).fill(5)));
  await expect(passkeyRecoveryRoot(wrong)).rejects.toThrow();
  const changed = credentials(); changed.get.mockImplementationOnce(async () => {
    await setItem("deviceSession", { signedOut: true, remotePending: true, generation: "changed" });
    return credential();
  });
  await expect(passkeyRecoveryRoot(changed)).rejects.toThrow(/changed|Unlock/);
  expect(JSON.stringify(await rawStore())).not.toContain(fixtureCode);
});

it("rejects a recovery confirmation when wrapper metadata changes during the passkey prompt", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const wrap = (await passkeyUnlockContext()).wrap!;
  const changed = credentials(); changed.get.mockImplementationOnce(async () => {
    await rawStore({ passkeyUnlock: { ...wrap, salt: encode(new Uint8Array(32).fill(9)) } });
    return credential();
  });
  await expect(passkeyRecoveryRoot(changed)).rejects.toThrow(/changed/);
});

it("saves only a sealed root, uses a saved PRF credential after reload and sign-out, and preserves offline edits", async () => {
  const creds = credentials();
  await enablePasskeyUnlock(fixtureCode, "passkey_user", creds);
  expect(creds.create.mock.calls[0]).toBeDefined();
  expect(await hasPasskeyUnlock()).toBe(true);
  const stored = await rawStore();
  expect(stored.passkeyUnlock).toMatchObject({ app: "drip-passkey-unlock", v: 1, credentialId: "AQID", rpId: "drip.test" });
  expect(JSON.stringify(stored)).not.toContain(fixtureCode);
  expect(JSON.stringify(stored)).not.toContain(encode(secret));
  expect(JSON.stringify(stored)).not.toContain("passkey_user");
  lockLocalVault(); await expect(loadData()).rejects.toThrow(/Unlock/);
  await unlockWithPasskey(creds); expect(await loadData()).toEqual(data);
  await saveData({ ...data, lastBackupAt: "offline-edit" });
  await expect(signOutDevice()).rejects.toThrow(/waiting for a connection/);
  await expect(loadData()).rejects.toThrow(/Unlock/);
  await unlockWithPasskey(creds);
  expect((await readDeviceSession())?.signedOut).toBe(false);
  expect((await loadData()).lastBackupAt).toBe("offline-edit");
  expect(cloud.connect).not.toHaveBeenCalled();
  const args = creds.get.mock.calls as unknown as [{ publicKey: PublicKeyCredentialRequestOptions }][];
  expect(args.at(-1)?.[0].publicKey).toMatchObject({ rpId: "drip.test", userVerification: "required", allowCredentials: [{ type: "public-key", id }] });
});

it("supports cached downloaded codes for one-time setup", async () => {
  const recovery = await createRecoveryCodes(fixtureCode);
  await setItem("recoveryRecords", recovery.records);
  await enablePasskeyUnlock(recovery.codes[0], "passkey_user", credentials());
  lockLocalVault(); await unlockWithPasskey(credentials());
  expect(await loadData()).toEqual(data);
});

it("opens with a passkey before best-effort cloud renewal and retains the connected account", async () => {
  await seedVault(data, fixtureCode, { userId: "owner", identityId: data.identity.id, key: {} as CryptoKey, version: 1, dirty: true, lastSyncAt: null, generation: "cloud", revision: 1 });
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  await expect(signOutDevice()).rejects.toThrow(/waiting for a connection/);
  vi.stubGlobal("navigator", { onLine: true, credentials: credentials() });
  cloud.connect.mockRejectedValueOnce(new Error("Auth outage"));
  await unlockWithPasskey(credentials());
  expect(await loadData()).toEqual(data);
  await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledWith(fixtureCode, data, false, undefined, expect.any(String)));
  expect((await rawStore()).cloudState).toMatchObject({ userId: "owner", dirty: true });
});

it("reports missing credential APIs without writing a wrapper", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  await expect(enablePasskeyUnlock(fixtureCode, "passkey_user", undefined)).rejects.toThrow(/does not support/);
});

it("never replaces a working wrapper after cancellation, missing PRF, wrong credential or bad recovery code", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const before = (await rawStore()).passkeyUnlock;
  const cancelled = credentials(); cancelled.create.mockResolvedValueOnce(null as unknown as PublicKeyCredential);
  await expect(enablePasskeyUnlock(fixtureCode, "passkey_user", cancelled)).rejects.toThrow(/cancelled/);
  const unsupported = credentials();
  unsupported.get.mockResolvedValueOnce({ ...credential(), getClientExtensionResults: () => ({}) } as PublicKeyCredential);
  await expect(enablePasskeyUnlock(fixtureCode, "passkey_user", unsupported)).rejects.toThrow(/does not support/);
  const other = credentials(); other.get.mockResolvedValueOnce(credential(secret, new Uint8Array([9])));
  await expect(enablePasskeyUnlock(fixtureCode, "passkey_user", other)).rejects.toThrow(/does not match/);
  const wrong = credentials();
  await expect(enablePasskeyUnlock("wrong", "passkey_user", wrong)).rejects.toThrow(/isn't your recovery/);
  expect(wrong.create).not.toHaveBeenCalled();
  expect((await rawStore()).passkeyUnlock).toEqual(before);
});

it("keeps encrypted records locked and recovery usable after a lost passkey, wrong PRF or tampering", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const before = (await rawStore()).data; lockLocalVault();
  const cancelled = credentials(); cancelled.get.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
  await expect(unlockWithPasskey(cancelled)).rejects.toThrow(/Cancelled/);
  const wrong = credentials(); wrong.get.mockResolvedValueOnce(credential(new Uint8Array(32).fill(5)));
  await expect(unlockWithPasskey(wrong)).rejects.toThrow();
  const raw = await rawStore(); const wrap = raw.passkeyUnlock;
  await rawStore({ passkeyUnlock: { ...wrap, ct: encode(new Uint8Array(50)) } });
  await expect(unlockWithPasskey(credentials())).rejects.toThrow();
  await expect(loadData()).rejects.toThrow(/Unlock/); expect((await rawStore()).data).toEqual(before);
  await unlockDevice(fixtureCode); expect(await loadData()).toEqual(data);
});

it("rejects origins and formats, and removes only this browser's wrapper", async () => {
  expect(await hasPasskeyUnlock()).toBe(false);
  await expect(unlockWithPasskey(credentials())).rejects.toThrow(/Set up passkey/);
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const wrap = (await passkeyUnlockContext()).wrap!;
  for (const changed of [{ ...wrap, v: 2 }, { ...wrap, origin: "https://evil.test" }, { ...wrap, salt: "!" }, { ...wrap, iv: "AA" }, { ...wrap, credentialId: "" }]) {
    await rawStore({ passkeyUnlock: changed });
    expect(await hasPasskeyUnlock()).toBe(false);
    await expect(unlockWithPasskey(credentials())).rejects.toThrow(/Set up passkey/);
  }
  await rawStore({ passkeyUnlock: wrap }); await disablePasskeyUnlock();
  expect((await rawStore()).passkeyUnlock).toBeUndefined();
  expect(await loadData()).toEqual(data); expect(await hasPasskeyUnlock()).toBe(false);
  lockLocalVault(); await unlockDevice(fixtureCode); expect(await loadData()).toEqual(data);
});

it("cancels setup when another tab signs out during the password-manager prompt", async () => {
  const creds = credentials();
  creds.get.mockImplementationOnce(async () => {
    await setItem("deviceSession", { signedOut: true, remotePending: true, generation: "other-tab" });
    return credential();
  });
  await expect(enablePasskeyUnlock(fixtureCode, "passkey_user", creds)).rejects.toThrow(/session changed/);
  expect((await rawStore()).passkeyUnlock).toBeUndefined();
  await expect(loadData()).rejects.toThrow(/Unlock/);
});

it("does not finish an unlock whose passkey was removed during its prompt", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const creds = credentials();
  creds.get.mockImplementationOnce(async () => { await disablePasskeyUnlock(); lockLocalVault(); return credential(); });
  await expect(unlockWithPasskey(creds)).rejects.toThrow(/session changed/);
  await expect(loadData()).rejects.toThrow(/Unlock/);
  await unlockDevice(fixtureCode); expect(await loadData()).toEqual(data);
});

it("cancels an unlock if sign-out or vault replacement happens during the prompt", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials()); lockLocalVault();
  const creds = credentials();
  creds.get.mockImplementationOnce(async () => {
    await setItem("deviceSession", { signedOut: true, remotePending: true, generation: "other-tab" });
    return credential();
  });
  await expect(unlockWithPasskey(creds)).rejects.toThrow(/session changed/);
  await expect(loadData()).rejects.toThrow(/Unlock/);
  await unlockDevice(fixtureCode);
  const replacing = credentials();
  replacing.get.mockImplementationOnce(async () => {
    await commitCloudRestore({ ...data, lastBackupAt: "replacement" }, undefined, await codeVerifier(fixtureCode), (await readDeviceSession())?.generation, undefined, fixtureCode);
    return credential();
  });
  await expect(unlockWithPasskey(replacing)).rejects.toThrow(/session changed/);
  expect((await rawStore()).passkeyUnlock).toBeUndefined();
  expect((await loadData()).lastBackupAt).toBe("replacement");
});

it("authenticates the wrapper metadata and refuses invalid roots and PRF lengths", async () => {
  await enablePasskeyUnlock(fixtureCode, "passkey_user", credentials());
  const wrap = (await passkeyUnlockContext()).wrap!;
  expect(await unwrapRoot(wrap, secret, location.origin, location.hostname)).toBe(fixtureCode);
  for (const field of ["vaultId", "credentialId", "salt"] as const) {
    await expect(unwrapRoot({ ...wrap, [field]: field === "salt" ? encode(new Uint8Array(32)) : "different" }, secret, location.origin, location.hostname)).rejects.toThrow();
  }
  await expect(unwrapRoot({ ...wrap, v: 2 } as any, secret, location.origin, location.hostname)).rejects.toThrow(/unavailable/);
  await expect(wrapRoot("bad", secret, wrap)).rejects.toThrow(/complete recovery/);
  await expect(wrapRoot(fixtureCode, decode("AA"), wrap)).rejects.toThrow(/cannot unlock/);
});
