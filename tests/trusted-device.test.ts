import { describe, it, expect, vi } from "vitest";
import { emptyData, localVaultStatus, lockLocalVault, unlockLocalVault, loadData, getItem, setItem, trustThisDevice, forgetThisDevice, isDeviceTrusted, localSessionBinding, commitLocalSignOut, TRUSTED_DEVICE_MS, VaultLockedError } from "../lib/db";
import { keepSignedIn } from "../app/StaySignedIn";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "stay_user", createdAt: "now" }, lastBackupAt: "stay-sentinel" };
const day = 24 * 60 * 60 * 1000;
const t0 = Date.parse("2026-11-17T08:00:00Z");

describe("keep me signed in on this device", () => {
  it("still asks to unlock on a fresh page unless the user opted in", async () => {
    await seedVault(data); lockLocalVault();
    expect(await localVaultStatus(t0)).toBe("locked");
    expect(await isDeviceTrusted(t0)).toBe(false);
  });
  it("reopens without signing in after opting in, using keys that cannot be exported", async () => {
    await seedVault(data); await trustThisDevice(t0);
    expect(await isDeviceTrusted(t0)).toBe(true);
    const raw = await rawStore();
    expect(raw.trustedDevice.dataKey.extractable).toBe(false); expect(raw.trustedDevice.cloudKey.extractable).toBe(false);
    expect(raw.trustedDevice.expiresAt).toBe(t0 + TRUSTED_DEVICE_MS);
    await expect(crypto.subtle.exportKey("raw", raw.trustedDevice.dataKey)).rejects.toThrow();
    lockLocalVault(); // a fresh page: nothing is left in memory
    expect(await localVaultStatus(t0 + day)).toBe("unlocked");
    expect(await loadData()).toEqual(data);
  });
  it("slides the 30-day window on each open and expires after 30 idle days", async () => {
    await seedVault(data); await trustThisDevice(t0);
    lockLocalVault(); expect(await localVaultStatus(t0 + 29 * day)).toBe("unlocked");
    expect((await rawStore()).trustedDevice.expiresAt).toBe(t0 + 29 * day + TRUSTED_DEVICE_MS);
    lockLocalVault(); expect(await localVaultStatus(t0 + 58 * day)).toBe("unlocked");
    lockLocalVault(); expect(await localVaultStatus(t0 + 89 * day)).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("ends on sign-out, so the next open asks to sign in", async () => {
    await seedVault(data); await trustThisDevice(t0);
    const binding = await localSessionBinding();
    await commitLocalSignOut(binding);
    expect((await rawStore()).trustedDevice).toBeUndefined();
    expect(await localVaultStatus(t0)).toBe("locked");
  });
  it("ends when the device session is marked signed out directly", async () => {
    await seedVault(data); await trustThisDevice(t0);
    const { generation } = await localSessionBinding();
    await setItem("deviceSession", { signedOut: true, remotePending: false, generation });
    expect((await rawStore()).trustedDevice).toBeUndefined();
    expect(await localVaultStatus(t0)).toBe("locked");
  });
  it("is discarded when the device session generation or vault no longer matches", async () => {
    await seedVault(data); await trustThisDevice(t0);
    const raw = await rawStore();
    await rawStore({ deviceSession: { ...raw.deviceSession, generation: "revoked-elsewhere" } });
    lockLocalVault(); expect(await localVaultStatus(t0)).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
    await rawStore({ deviceSession: raw.deviceSession, trustedDevice: { ...raw.trustedDevice, vaultId: "another-vault" } });
    expect(await localVaultStatus(t0)).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("does not restore over an unfinished signup and refuses to trust one", async () => {
    await seedVault(data); await trustThisDevice(t0);
    const raw = await rawStore();
    await rawStore({ signupRecoveryRequired: { vaultId: raw.localVault.id } });
    await expect(trustThisDevice(t0)).rejects.toThrow(/recovery codes/);
    lockLocalVault(); expect(await localVaultStatus(t0)).toBe("locked");
  });
  it("cannot be read or written through the generic storage interface", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await expect(getItem("trustedDevice")).rejects.toThrow(/local vault/);
    await expect(setItem("trustedDevice", {})).rejects.toThrow(/encrypted storage/);
    await forgetThisDevice(); expect(await isDeviceTrusted(t0)).toBe(false);
  });
  it("needs an unlocked vault, and a failure never undoes a completed sign-in", async () => {
    await seedVault(data); lockLocalVault();
    await expect(trustThisDevice(t0)).rejects.toBeInstanceOf(VaultLockedError);
    expect(await keepSignedIn(true)).toBe(false);
    expect(await keepSignedIn(false)).toBe(false);
  });
  it("remembers the device from the sign-in helper when ticked", async () => {
    vi.setSystemTime?.(t0);
    await seedVault(data);
    expect(await keepSignedIn(true)).toBe(true);
    lockLocalVault(); expect(await localVaultStatus()).toBe("unlocked");
  });
  it("discards malformed or out-of-scope records instead of trusting them", async () => {
    await seedVault(data); await trustThisDevice(t0);
    const raw = await rawStore();
    for (const bad of [{ ...raw.trustedDevice, dataKey: { fake: true } }, { ...raw.trustedDevice, cloudKey: "key" }, { ...raw.trustedDevice, expiresAt: "never" }]) {
      await rawStore({ trustedDevice: bad }); lockLocalVault();
      expect(await localVaultStatus(t0)).toBe("locked"); expect((await rawStore()).trustedDevice).toBeUndefined();
    }
    await rawStore({ trustedDevice: raw.trustedDevice, deviceSession: { ...raw.deviceSession, signedOut: true } });
    expect(await isDeviceTrusted(t0)).toBe(false); expect(await localVaultStatus(t0)).toBe("locked");
  });
  it("restores once when two tabs open together", async () => {
    await seedVault(data); await trustThisDevice(t0); lockLocalVault();
    expect(await Promise.all([localVaultStatus(t0), localVaultStatus(t0)])).toEqual(["unlocked", "unlocked"]);
    expect(await loadData()).toEqual(data);
  });
  it("leaves a brand-new device alone", async () => {
    expect(await localVaultStatus(t0)).toBe("new"); expect(await isDeviceTrusted(t0)).toBe(false);
    await rawStore({ trustedDevice: { vaultId: "x", expiresAt: t0 + day } });
    expect(await localVaultStatus(t0)).toBe("new"); expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("requires an owner-matched online session before restoring a connected trusted device", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } });
    lockLocalVault();
    const verify = vi.fn().mockResolvedValue("valid");
    expect(await localVaultStatus(t0 + day, verify)).toBe("unlocked");
    expect(verify).toHaveBeenCalledWith("owner");
    expect(await loadData()).toEqual(data);
    lockLocalVault();
    expect(await localVaultStatus(t0 + day, async () => "invalid")).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("keeps an explicitly unlocked session open if its cookie is expired, then validates on next open", async () => {
    await seedVault(data);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } });
    await trustThisDevice(t0);
    const check = vi.fn().mockResolvedValue("invalid");
    expect(await localVaultStatus(t0 + day, check)).toBe("unlocked");
    expect(check).toHaveBeenCalledWith("owner");
    expect(await loadData()).toEqual(data);
    lockLocalVault();
    expect(await localVaultStatus(t0 + day, check)).toBe("locked");
    expect(check).toHaveBeenCalledWith("owner");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("checks a remembered session while open and locks after the server revokes it", async () => {
    await seedVault(data);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } });
    await trustThisDevice(t0);
    const verify = vi.fn().mockResolvedValue("valid");
    expect(await localVaultStatus(t0, verify)).toBe("unlocked");
    expect(await loadData()).toEqual(data);
    verify.mockResolvedValue("invalid");
    expect(await localVaultStatus(t0 + 60_000, verify)).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
    await expect(loadData()).rejects.toBeInstanceOf(VaultLockedError);
  });
  it("preserves offline access but locks and forgets the device after revocation is detected on reconnect", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    expect(await localVaultStatus(t0 + day, async () => "offline")).toBe("unlocked");
    expect(await localVaultStatus(t0 + day, async () => "invalid")).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
    await expect(loadData()).rejects.toBeInstanceOf(VaultLockedError);
  });
  it("keeps the trusted record but does not restore when online verification is unavailable", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    expect(await localVaultStatus(t0 + day, async () => "unavailable")).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeDefined();
    expect(await localVaultStatus(t0 + day, async () => "valid")).toBe("unlocked");
  });
  it("cannot restore after sign-out while session validation is in flight", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    let finish!: (value: "valid") => void;
    const check = vi.fn(() => new Promise<"valid">(resolve => { finish = resolve; }));
    const pending = localVaultStatus(t0 + day, check);
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    await commitLocalSignOut(await localSessionBinding()); finish("valid");
    expect(await pending).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("locks a parallel trusted restore when a later verification detects revocation", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    let valid!: (value: "valid") => void, invalid!: (value: "invalid") => void;
    const first = vi.fn(() => new Promise<"valid">(resolve => { valid = resolve; }));
    const second = vi.fn(() => new Promise<"invalid">(resolve => { invalid = resolve; }));
    const one = localVaultStatus(t0 + day, first), two = localVaultStatus(t0 + day, second);
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
    valid("valid"); expect(await one).toBe("unlocked");
    invalid("invalid"); expect(await two).toBe("locked");
    await expect(loadData()).rejects.toBeInstanceOf(VaultLockedError);
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("does not restore when an earlier parallel verification detects revocation", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    let valid!: (value: "valid") => void, invalid!: (value: "invalid") => void;
    const first = vi.fn(() => new Promise<"valid">(resolve => { valid = resolve; }));
    const second = vi.fn(() => new Promise<"invalid">(resolve => { invalid = resolve; }));
    const one = localVaultStatus(t0 + day, first), two = localVaultStatus(t0 + day, second);
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
    invalid("invalid"); expect(await two).toBe("locked");
    valid("valid"); expect(await one).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("does not recreate a trusted record removed by another tab during verification", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    let finish!: (value: "valid") => void;
    const check = vi.fn(() => new Promise<"valid">(resolve => { finish = resolve; }));
    const pending = localVaultStatus(t0 + day, check);
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("drip"); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const transaction = db.transaction("kv", "readwrite"); transaction.objectStore("kv").delete("trustedDevice"); transaction.oncomplete = () => { db.close(); resolve(); }; });
    finish("valid"); expect(await pending).toBe("locked");
    expect((await rawStore()).trustedDevice).toBeUndefined();
  });
  it("does not let an old invalid check revoke a newly verified local unlock", async () => {
    await seedVault(data); await trustThisDevice(t0);
    await rawStore({ cloudState: { userId: "owner", generation: "cloud-1" } }); lockLocalVault();
    let finish!: (value: "invalid") => void;
    const check = vi.fn(() => new Promise<"invalid">(resolve => { finish = resolve; }));
    const pending = localVaultStatus(t0 + day, check);
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    await unlockLocalVault(fixtureCode); await trustThisDevice(t0 + day);
    finish("invalid"); expect(await pending).toBe("unlocked");
    expect((await rawStore()).trustedDevice).toBeDefined();
    expect(await loadData()).toEqual(data);
  });
});
