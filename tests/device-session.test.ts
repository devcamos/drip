import { beforeEach, describe, expect, it, vi } from "vitest";
const cloud = vi.hoisted(() => ({ readCloudState: vi.fn(), connect: vi.fn(), restoreCloud: vi.fn(), authClient: { signOut: vi.fn() } }));
vi.mock("../lib/cloud", () => cloud);
import { finishDeviceSignOut, readDeviceSession, resumeDevice, signOutDevice, restoreOtherAccount } from "../lib/device-session";
import { cloudSnapshot, completeDeviceSession, emptyData, getItem, loadData, saveData, setItem, commitCloudRestore, storeCloudConnection } from "../lib/db";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
const code = generateRecoveryCode(); const data = { ...emptyData(), identity: { id: "local", handle: "rampage201", createdAt: "now" } };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: true })));
  cloud.readCloudState.mockResolvedValue({ userId: "owner", dirty: true });
  cloud.authClient.signOut.mockResolvedValue({ error: null }); cloud.connect.mockResolvedValue({ user: { id: "owner" } });
});
describe("persistent sign-out without losing local numbers", () => {
  it("ends the server session, keeps data and blocks stale writes/restores until explicit resume", async () => {
    await saveData(data); const verifier = await codeVerifier(code); await setItem("verifier", verifier);
    await signOutDevice();
    expect(await readDeviceSession()).toMatchObject({ signedOut: true, remotePending: false });
    expect(cloud.authClient.signOut).toHaveBeenCalledOnce();
    expect((await cloudSnapshot()).signedOut).toBe(true);
    await saveData({ ...data, lastBackupAt: "must-not-write" });
    expect(await loadData()).toEqual(data);
    await expect(commitCloudRestore(emptyData(), undefined, { salt: "x", hash: "x" }, undefined)).rejects.toThrow(/Device session changed/);
    await expect(storeCloudConnection(undefined)).rejects.toThrow(/Device session changed/);
    expect(await getItem("verifier")).toEqual(verifier);
    await expect(resumeDevice(generateRecoveryCode(), verifier, data)).rejects.toThrow(/isn't your recovery/);
    expect((await readDeviceSession())?.signedOut).toBe(true);
    await resumeDevice(code, verifier, data);
    expect((await readDeviceSession())?.signedOut).toBe(false);
    expect(cloud.connect).toHaveBeenCalledWith(code, data, false, expect.any(String));
    expect(await loadData()).toEqual(data);
  });
  it("locks offline immediately and leaves server revocation explicitly pending", async () => {
    await saveData(data); vi.stubGlobal("navigator", { onLine: false });
    await expect(signOutDevice()).rejects.toThrow(/waiting for a connection/);
    expect(await readDeviceSession()).toMatchObject({ signedOut: true, remotePending: true });
    expect(cloud.authClient.signOut).not.toHaveBeenCalled();
    await resumeDevice(code, await codeVerifier(code), data);
    expect((await readDeviceSession())?.signedOut).toBe(false);
    expect(cloud.connect).not.toHaveBeenCalled();
    expect(await loadData()).toEqual(data);
  });
  it("does not pretend a failed server sign-out succeeded and can retry without reconnecting accounts", async () => {
    cloud.authClient.signOut.mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(signOutDevice()).rejects.toThrow(/Could not confirm/);
    expect((await readDeviceSession())?.remotePending).toBe(true);
    await finishDeviceSignOut();
    expect((await readDeviceSession())?.remotePending).toBe(false);
    expect(cloud.connect).not.toHaveBeenCalled();
    await finishDeviceSignOut(); expect(cloud.authClient.signOut).toHaveBeenCalledTimes(2);
  });
  it("supports local-only builds and rejects a failed backend status check", async () => {
    cloud.readCloudState.mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValue(Response.json({ available: false }));
    await signOutDevice(); expect(cloud.authClient.signOut).not.toHaveBeenCalled();
    await resumeDevice(code, await codeVerifier(code), data);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(signOutDevice()).rejects.toThrow(/Could not confirm/);
  });
  it("waits for a pending sign-out before renewing sign-in and rejects another owner", async () => {
    let finish!: (value: unknown) => void;
    cloud.authClient.signOut.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = signOutDevice();
    await vi.waitFor(() => expect(cloud.authClient.signOut).toHaveBeenCalledOnce());
    const resume = resumeDevice(code, await codeVerifier(code), data);
    expect(cloud.connect).not.toHaveBeenCalled();
    finish({ error: null }); await pending; await resume;
    expect((await readDeviceSession())?.signedOut).toBe(false);
    cloud.authClient.signOut.mockResolvedValue({ error: null }); await signOutDevice();
    cloud.connect.mockResolvedValue({ user: { id: "other" } });
    await expect(resumeDevice(code, await codeVerifier(code), data)).rejects.toThrow(/connected cloud account/);
    expect((await readDeviceSession())?.signedOut).toBe(true);
  });
  it("claims a new generation before an in-flight sign-in finishes deriving its key", async () => {
    await signOutDevice(); const old = (await readDeviceSession())!;
    let finish!: (value: unknown) => void;
    cloud.connect.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const resume = resumeDevice(code, await codeVerifier(code), data);
    await vi.waitFor(() => expect(cloud.connect).toHaveBeenCalledOnce());
    const claimed = (await readDeviceSession())!;
    expect(claimed.signedOut).toBe(true); expect(claimed.remotePending).toBe(false);
    expect(claimed.generation).not.toBe(old.generation);
    expect(await completeDeviceSession(old.generation, old)).toBe(false);
    finish({ user: { id: "owner" } }); await resume;
    expect((await readDeviceSession())?.signedOut).toBe(false);
  });
  it("restores another account atomically after sign-out and preserves the old copy if recovery fails", async () => {
    await saveData(data); await signOutDevice();
    cloud.restoreCloud.mockRejectedValueOnce(new Error("No cloud copy"));
    await expect(restoreOtherAccount(code)).rejects.toThrow(/No cloud copy/);
    expect(await loadData()).toEqual(data); expect((await readDeviceSession())?.signedOut).toBe(true);
    const other = { ...data, identity: { ...data.identity!, id: "other", handle: "otheruser" } };
    cloud.restoreCloud.mockImplementationOnce(async (_code: string, _user: unknown, generation: string) => {
      await commitCloudRestore(other, undefined, await codeVerifier(code), generation, generation); return other;
    });
    expect(await restoreOtherAccount(code)).toEqual(other);
    expect((await loadData()).identity?.handle).toBe("otheruser");
    expect((await readDeviceSession())?.signedOut).toBe(false);
    await expect(restoreOtherAccount(code)).rejects.toThrow(/Sign out before switching/);
  });
  it("does not apply stale sign-out completion or restore across a newer session generation", async () => {
    await setItem("deviceSession", { signedOut: false, generation: "new" });
    expect(await completeDeviceSession("old", { signedOut: true })).toBe(false);
    expect(await getItem("deviceSession")).toEqual({ signedOut: false, generation: "new" });
    await expect(commitCloudRestore(data, undefined, { salt: "x", hash: "x" }, "old")).rejects.toThrow(/Device session changed/);
    await expect(storeCloudConnection(undefined, "old")).rejects.toThrow(/Device session changed/);
    await commitCloudRestore(data, undefined, { salt: "x", hash: "x" }, "new");
    await storeCloudConnection(undefined, "new");
    expect(await loadData()).toEqual(data);
    await expect(resumeDevice(code, await codeVerifier(code), data)).rejects.toThrow(/Device session changed/);
  });
});
