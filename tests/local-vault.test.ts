import { describe, it, expect, vi } from "vitest";
import { emptyData, localVaultStatus, unlockLocalVault, lockLocalVault, loadData, saveData, getItem, setItem, commitCloudRestore } from "../lib/db";
import { codeVerifier, deriveCloudEncryptionKey, generateRecoveryCode } from "../lib/crypto";
import { createRecoveryCodes, resolveRecoveryCode } from "../lib/recovery-codes";
import { rawStore, seedVault, fixtureCode as code } from "./storage-fixtures";
const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "private_user", createdAt: "now" }, lastBackupAt: "private-sentinel" };

describe("encrypted local storage", () => {
  it("stores ciphertext and a wrapped key, with no reusable CryptoKey, root, or financial records at rest", async () => {
    await seedVault(data, code, { userId: "owner", identityId: data.identity.id, key: await deriveCloudEncryptionKey(code), version: 1, dirty: false, lastSyncAt: null, generation: "cloud", revision: 0 });
    const raw = await rawStore();
    expect(raw.data.app).toBe("drip-local-data"); expect(raw.localVault.wrappedKey.app).toBe("drip");
    expect(raw.cloudState).not.toHaveProperty("key");
    expect(JSON.stringify(raw)).not.toMatch(/private_user|private-sentinel|AAAA-BBBB|accounts|dataKey/);
    const keys: unknown[] = []; const visit = (x: any) => { if (x && typeof x === "object") { if (x instanceof CryptoKey) keys.push(x); else Object.values(x).forEach(visit); } }; visit(raw);
    expect(keys).toHaveLength(0); expect(await loadData()).toEqual(data);
  });
  it("requires recovery after a fresh runtime and leaves ciphertext intact for wrong codes", async () => {
    await seedVault(data); const before = await rawStore();
    lockLocalVault(); expect(await localVaultStatus()).toBe("locked");
    await expect(loadData()).rejects.toThrow(/Unlock/);
    await expect(unlockLocalVault(generateRecoveryCode())).rejects.toThrow(/isn't your recovery/);
    expect(await rawStore()).toEqual(before);
    await unlockLocalVault(code); expect(await loadData()).toEqual(data);
  });
  it("migrates legacy records and removes the old cloud and onboarding keys in one verified commit", async () => {
    const key = await deriveCloudEncryptionKey(code);
    await rawStore({ data, verifier: await codeVerifier(code), cloudState: { userId: "owner", identityId: data.identity.id, key, version: 7, dirty: true, revision: 3, generation: "legacy", lastSyncAt: null }, onboardingDraft: { code, key } });
    expect(await localVaultStatus()).toBe("migration"); await expect(loadData()).rejects.toThrow(/Unlock/);
    await unlockLocalVault(code); const raw = await rawStore();
    expect(raw.data.app).toBe("drip-local-data"); expect(raw.cloudState).not.toHaveProperty("key"); expect(raw.onboardingDraft).toBeUndefined();
    expect(raw.cloudState).toMatchObject({ version: 7, dirty: true, revision: 3, generation: "legacy" });
    expect(await loadData()).toEqual(data);
    expect((await getItem<any>("cloudState")).key.extractable).toBe(false);
    // Old code opening schema v1 can no longer write plaintext over the vault.
    await expect(new Promise((resolve, reject) => { const r = indexedDB.open("drip", 1); r.onsuccess = () => { r.result.close(); resolve(null); }; r.onerror = () => reject(r.error); })).rejects.toThrow();
  });
  it("keeps the original plaintext intact if migration encryption fails", async () => {
    await rawStore({ data, verifier: await codeVerifier(code) }); const before = await rawStore();
    vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(new Error("crypto failure"));
    await expect(unlockLocalVault(code)).rejects.toThrow(/crypto failure/);
    expect(await rawStore()).toEqual(before); expect(await localVaultStatus()).toBe("migration");
  });
  it("rejects a migration interrupted by sign-out, without removing the old copy", async () => {
    await rawStore({ data, verifier: await codeVerifier(code) });
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
      const result = await encrypt(...args); await setItem("deviceSession", { signedOut: true, generation: "out" }); return result;
    });
    await expect(unlockLocalVault(code)).rejects.toThrow(/Device session changed/);
    const raw = await rawStore(); expect(raw.data).toEqual(data); expect(raw.localVault).toBeUndefined();
  });
  it("uses new nonces and rejects tampered data or a changed vault id", async () => {
    await seedVault(data); const first = (await rawStore()).data;
    await saveData(data); const second = (await rawStore()).data;
    expect(first.iv).not.toBe(second.iv); expect(first.ct).not.toBe(second.ct);
    await rawStore({ data: { ...second, ct: second.ct.slice(4) } }); lockLocalVault();
    await expect(unlockLocalVault(code)).rejects.toThrow(); expect(await localVaultStatus()).toBe("locked");
    const raw = await rawStore(); await rawStore({ data: second, localVault: { ...raw.localVault, id: "wrong-vault" } });
    await expect(unlockLocalVault(code)).rejects.toThrow(/Invalid local key/);
  });
  it("rejects an encrypted write finishing after sign-out and preserves the prior ciphertext", async () => {
    await seedVault(data); const first = (await rawStore()).data;
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
      const result = await encrypt(...args); await setItem("deviceSession", { signedOut: true, generation: "out" }); return result;
    });
    await expect(saveData({ ...data, lastBackupAt: "discard-this" })).rejects.toThrow(/Device session changed/);
    expect((await rawStore()).data).toEqual(first); await expect(loadData()).rejects.toThrow(/Unlock/);
  });
  it("serialises encrypted saves and keeps the newest local revision", async () => {
    await seedVault(data);
    await Promise.all([saveData({ ...data, lastBackupAt: "first" }), saveData({ ...data, lastBackupAt: "second" })]);
    expect((await loadData()).lastBackupAt).toBe("second");
    expect(JSON.stringify(await rawStore())).not.toContain("second");
    await expect(setItem("data", data)).rejects.toThrow(/encrypted storage/);
  });
  it("unlocks offline with a cached alternative code and does not require cloud data replacement", async () => {
    await seedVault(data); const { codes, records } = await createRecoveryCodes(code); await setItem("recoveryRecords", records);
    lockLocalVault(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("offline"); }));
    await unlockLocalVault(await resolveRecoveryCode(codes[0])); expect(await loadData()).toEqual(data); expect(fetch).not.toHaveBeenCalled();
  });
  it("rekeys imported accounts and rejects the old recovery code after replacement", async () => {
    await seedVault(data); const replacementCode = generateRecoveryCode();
    const replacement = { ...data, lastBackupAt: "replacement" };
    await commitCloudRestore(replacement, undefined, await codeVerifier(replacementCode), undefined, undefined, replacementCode);
    lockLocalVault(); await expect(unlockLocalVault(code)).rejects.toThrow(/isn't your recovery/);
    await unlockLocalVault(replacementCode); expect(await loadData()).toEqual(replacement);
  });
});

describe("replacement and migration races", () => {
  it("invalidates both in-flight and queued writes when a restore replaces the local vault", async () => {
    await seedVault(data);
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let release!: () => void; let reached!: () => void;
    const started = new Promise<void>(resolve => { reached = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
      const result = await encrypt(...args); reached(); await hold; return result;
    });
    const first = saveData({ ...data, lastBackupAt: "discarded-1" });
    const second = saveData({ ...data, lastBackupAt: "discarded-2" });
    const firstResult = first.catch(error => error); const secondResult = second.catch(error => error);
    await started;
    const restored = { ...data, lastBackupAt: "restored" };
    await commitCloudRestore(restored, undefined, await codeVerifier(code), undefined, undefined, code);
    release(); expect(await firstResult).toBeInstanceOf(Error); expect(await secondResult).toBeInstanceOf(Error);
    expect(await loadData()).toEqual(restored);
  });
  it("refuses to remove a legacy cloud key that belongs to a different recovery code", async () => {
    await rawStore({ data, verifier: await codeVerifier(code), cloudState: { key: await deriveCloudEncryptionKey(generateRecoveryCode()), userId: "owner" } });
    const before = await rawStore(); await expect(unlockLocalVault(code)).rejects.toThrow(/does not match the cloud key/);
    expect(await rawStore()).toEqual(before);
  });
});

it("rolls the entire migration back when storage fails after encrypted records were queued", async () => {
  await rawStore({ data, verifier: await codeVerifier(code) }); const before = await rawStore();
  const put = IDBObjectStore.prototype.put;
  const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: any, key?: IDBValidKey) {
    if (key === "cloudState") throw new Error("Storage quota exceeded");
    return put.call(this, value, key);
  });
  await expect(unlockLocalVault(code)).rejects.toThrow(/Storage quota exceeded/);
  failure.mockRestore(); expect(await rawStore()).toEqual(before); expect(await localVaultStatus()).toBe("migration");
});

it("does not let delayed disconnect clear a newer cloud connection", async () => {
  const db = await import("../lib/db");
  await seedVault(data, code, { userId: "owner", identityId: data.identity.id, key: {} as CryptoKey, version: 7, dirty: true, lastSyncAt: null, revision: 3, generation: "new-connection" });
  await expect(db.storeCloudConnection(undefined, undefined, "old-connection")).rejects.toThrow(/Cloud connection changed/);
  expect(await getItem("cloudState")).toMatchObject({ generation: "new-connection", dirty: true, version: 7 });
  await db.storeCloudConnection(undefined, undefined, "new-connection"); expect(await getItem("cloudState")).toBeUndefined();
  expect(await loadData()).toEqual(data);
});
