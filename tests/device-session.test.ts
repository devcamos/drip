import { beforeEach, describe, expect, it, vi } from "vitest";
const cloud = vi.hoisted(() => ({ connect: vi.fn(), restoreCloud: vi.fn(), authClient: { signOut: vi.fn() } }));
vi.mock("../lib/cloud", () => cloud);
import { finishDeviceSignOut, readDeviceSession, resumeDevice, signOutDevice, restoreOtherAccount, unlockDevice } from "../lib/device-session";
import { cloudSnapshot, completeDeviceSession, emptyData, getItem, loadData, saveData, setItem, commitCloudRestore, storeCloudConnection, unlockLocalVault, lockLocalVault, localSessionBinding } from "../lib/db";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
import { seedVault, rawStore } from "./storage-fixtures";
import * as storage from "../lib/db";
const code = generateRecoveryCode();
const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "rampage201", createdAt: "now" } };
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: true })));
  cloud.authClient.signOut.mockResolvedValue({ error: null }); cloud.connect.mockResolvedValue({ user: { id: "owner" } });
  await seedVault(data, code, { userId: "owner", identityId: data.identity.id, key: {} as CryptoKey, version: 1, dirty: true, lastSyncAt: null, generation: "cloud", revision: 0 });
});
describe("encrypted sign-out and return", () => {
  it("keeps a newer generation when another tab signs in while local sign-out is waiting for accepted edits", async () => {
    await saveData({ ...data, lastBackupAt: "accepted-before-signout" });
    const expected = await localSessionBinding();
    let ready!: () => void, finish!: () => void;
    const prepared = new Promise<void>(resolve => { ready = resolve; });
    const resume = new Promise<void>(resolve => { finish = resolve; });
    const original = storage.prepareLocalSignOut;
    vi.spyOn(storage, "prepareLocalSignOut").mockImplementationOnce(async () => { await original(); ready(); await resume; });
    const pending = signOutDevice(expected);
    await prepared;
    await setItem("deviceSession", { signedOut: false, remotePending: false, generation: "newer-while-waiting" });
    finish(); await expect(pending).rejects.toThrow(/newer sign-in|session changed/);
    expect(await readDeviceSession()).toMatchObject({ signedOut: false, generation: "newer-while-waiting" });
    expect(cloud.authClient.signOut).not.toHaveBeenCalled();
    await unlockLocalVault(code); expect((await loadData()).lastBackupAt).toBe("accepted-before-signout");
  });
  it("rejects an old managed sign-out after the local account is replaced even when its generation is unchanged", async () => {
    const original = await localSessionBinding();
    const other = { ...data, identity: { ...data.identity, id: crypto.randomUUID(), handle: "newer_user" } };
    await seedVault(other, generateRecoveryCode());
    const newer = await localSessionBinding(); expect(newer.generation).toBe(original.generation); expect(newer.vaultId).not.toBe(original.vaultId);
    await expect(signOutDevice(original)).rejects.toThrow(/newer sign-in/);
    expect(await loadData()).toEqual(other); expect(cloud.authClient.signOut).not.toHaveBeenCalled(); expect(await localSessionBinding()).toEqual(newer);
  });
  it("ends the server session, drops keys and rejects stale writes/restores until explicit resume", async () => {
    const verifier = (await getItem<{ salt: string; hash: string }>("verifier"))!;
    const retained = (await rawStore()).data;
    await signOutDevice();
    expect(await readDeviceSession()).toMatchObject({ signedOut: true, remotePending: false });
    expect(cloud.authClient.signOut).toHaveBeenCalledOnce();
    expect((await cloudSnapshot()).signedOut).toBe(true);
    await expect(saveData({ ...data, lastBackupAt: "must-not-write" })).rejects.toThrow(/Unlock/);
    await expect(loadData()).rejects.toThrow(/Unlock/);
    expect((await rawStore()).data).toEqual(retained);
    await expect(commitCloudRestore(emptyData(), undefined, verifier)).rejects.toThrow(/Device session changed/);
    await expect(storeCloudConnection(undefined)).rejects.toThrow(/Unlock/);
    await expect(resumeDevice(generateRecoveryCode(), verifier)).rejects.toThrow(/isn't your recovery/);
    await resumeDevice(code, verifier);
    expect((await readDeviceSession())?.signedOut).toBe(false);
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledWith(code, data, false, undefined, expect.any(String)));
    expect(await loadData()).toEqual(data);
    expect((await rawStore()).cloudState).not.toHaveProperty("key");
  });
  it("unlocks offline without losing queued local data", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(signOutDevice()).rejects.toThrow(/waiting for a connection/);
    expect(await readDeviceSession()).toMatchObject({ signedOut: true, remotePending: true });
    await unlockDevice(code);
    expect(cloud.connect).not.toHaveBeenCalled(); expect(await loadData()).toEqual(data);
  });
  it("keeps failed cloud sign-out pending and supports retry", async () => {
    cloud.authClient.signOut.mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(signOutDevice()).rejects.toThrow(/Could not confirm/);
    expect((await readDeviceSession())?.remotePending).toBe(true);
    await finishDeviceSignOut(); expect((await readDeviceSession())?.remotePending).toBe(false);
    await finishDeviceSignOut(); expect(cloud.authClient.signOut).toHaveBeenCalledTimes(2);
  });
  it("supports local-only builds and reports failed status checks", async () => {
    await storeCloudConnection(undefined);
    vi.mocked(fetch).mockResolvedValue(Response.json({ available: false }));
    await signOutDevice(); expect(cloud.authClient.signOut).not.toHaveBeenCalled();
    await unlockDevice(code);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(signOutDevice()).rejects.toThrow(/Could not confirm/);
  });
  it("waits for sign-out before authenticating; a failed cloud renewal keeps local accounts usable", async () => {
    let finish!: (value: unknown) => void;
    cloud.authClient.signOut.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = signOutDevice();
    await vi.waitFor(() => expect(cloud.authClient.signOut).toHaveBeenCalledOnce());
    const resume = unlockDevice(code); expect(cloud.connect).not.toHaveBeenCalled();
    finish({ error: null }); await pending; await resume;
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledOnce());
    cloud.authClient.signOut.mockResolvedValue({ error: null }); await signOutDevice();
    cloud.connect.mockResolvedValue({ user: { id: "other" } });
    await unlockDevice(code);
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledTimes(2));
    expect(await loadData()).toEqual(data);
    expect(await getItem("cloudState")).toMatchObject({ userId: "owner", dirty: true });
  });
  it("opens local accounts before a slow cloud sign-in finishes", async () => {
    await signOutDevice(); const old = (await readDeviceSession())!;
    let finish!: (value: unknown) => void;
    cloud.connect.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await unlockDevice(code);
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledOnce());
    const claimed = (await readDeviceSession())!;
    expect(claimed.signedOut).toBe(false); expect(claimed.generation).not.toBe(old.generation);
    expect(await completeDeviceSession(old.generation, old)).toBe(false);
    expect(await loadData()).toEqual(data);
    finish({ user: { id: "owner" } });
    expect(await loadData()).toEqual(data);
  });
  it("unlocks with a valid code during an online authentication outage and retains queued edits", async () => {
    await signOutDevice();
    cloud.connect.mockRejectedValue(new Error("Authentication database unavailable"));
    await unlockDevice(code);
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledOnce());
    expect((await readDeviceSession())?.signedOut).toBe(false);
    expect(await loadData()).toEqual(data);
    await saveData({ ...data, lastBackupAt: "saved-during-outage" });
    expect((await loadData()).lastBackupAt).toBe("saved-during-outage");
    expect(await getItem("cloudState")).toMatchObject({ userId: "owner", dirty: true });
  });
  it("restores another encrypted account atomically and retains ciphertext on failure", async () => {
    await signOutDevice(); const retained = (await rawStore()).data;
    cloud.restoreCloud.mockRejectedValueOnce(new Error("No cloud copy"));
    await expect(restoreOtherAccount(code)).rejects.toThrow(/No cloud copy/);
    expect((await rawStore()).data).toEqual(retained);
    const other = { ...data, identity: { ...data.identity, id: "7f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "otheruser" } };
    cloud.restoreCloud.mockImplementationOnce(async (_code: string, _user: unknown, generation: string) => {
      await commitCloudRestore(other, undefined, await codeVerifier(code), generation, generation, code); return other;
    });
    expect(await restoreOtherAccount(code)).toEqual(other);
    expect((await loadData()).identity?.handle).toBe("otheruser");
    expect((await readDeviceSession())?.signedOut).toBe(false);
    await expect(restoreOtherAccount(code)).rejects.toThrow(/Sign out before switching/);
  });
  it("rejects stale operations across device generations and requires keys after a fresh runtime", async () => {
    await setItem("deviceSession", { signedOut: false, generation: "new" });
    expect(await completeDeviceSession("old", { signedOut: true })).toBe(false);
    await expect(commitCloudRestore(data, undefined, await codeVerifier(code), "old")).rejects.toThrow(/Device session changed/);
    await unlockLocalVault(code);
    await commitCloudRestore(data, undefined, await codeVerifier(code), "new");
    await storeCloudConnection(undefined, "new");
    lockLocalVault(); await expect(loadData()).rejects.toThrow(/Unlock/);
    await unlockDevice(code); expect(await loadData()).toEqual(data);
  });
});

it("finishes an accepted encrypted save before normal sign-out drops its key", async () => {
  const updated = { ...data, lastBackupAt: "latest-offline-edit" };
  const saved = saveData(updated);
  await signOutDevice(); await saved;
  await unlockDevice(code); expect(await loadData()).toEqual(updated);
});
