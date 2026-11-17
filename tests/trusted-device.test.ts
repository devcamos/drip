import { describe, it, expect, vi } from "vitest";
import { emptyData, localVaultStatus, lockLocalVault, loadData, getItem, setItem, trustThisDevice, forgetThisDevice, isDeviceTrusted, localSessionBinding, commitLocalSignOut, TRUSTED_DEVICE_MS, VaultLockedError } from "../lib/db";
import { keepSignedIn } from "../app/StaySignedIn";
import { rawStore, seedVault } from "./storage-fixtures";

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
});
