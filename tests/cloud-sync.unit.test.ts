import { beforeEach, expect, it, vi } from "vitest";
import { releaseData, releaseSaver } from "./saved-experience-fixtures";
const dep = vi.hoisted(() => ({ snapshot: vi.fn(), acknowledge: vi.fn(), getItem: vi.fn(), store: vi.fn(), restore: vi.fn(), isAppData: vi.fn(), fetch: vi.fn(), session: vi.fn() }));
vi.mock("../lib/db", () => ({ cloudSnapshot: dep.snapshot, acknowledgeCloudUpload: dep.acknowledge, getItem: dep.getItem, storeCloudConnection: dep.store, commitCloudRestore: dep.restore, isAppData: dep.isAppData }));
vi.mock("../lib/worker-safety", () => ({ safeFetch: dep.fetch }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => ({ getSession: dep.session }) }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import { syncNow, vault } from "../lib/cloud";

const data = releaseData([releaseSaver()]);
const state = { userId: "owner", identityId: data.identity!.id, key: {} as CryptoKey, version: 2, dirty: false, lastSyncAt: null, generation: "connection", revision: 4, vaultId: "vault" };
const snapshot = (changes = {}) => ({ data, state: { ...state, ...changes }, signedOut: false });
beforeEach(() => {
  vi.resetAllMocks(); dep.snapshot.mockResolvedValue(snapshot()); dep.session.mockResolvedValue({ data: { user: { id: "owner" } } });
  dep.fetch.mockImplementation(async () => Response.json({ version: 2, envelope: null })); dep.acknowledge.mockResolvedValue("saved");
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes, subtle: { encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) } });
});
it("never contacts the server when the device is signed out or cloud sync is off", async () => {
  dep.snapshot.mockResolvedValueOnce({ data, signedOut: true }); expect(await syncNow()).toBe("Signed out. Cloud sync is paused.");
  dep.snapshot.mockResolvedValueOnce({ data, signedOut: false }); expect(await syncNow()).toBe("Cloud recovery is off.");
  expect(dep.session).not.toHaveBeenCalled(); expect(dep.fetch).not.toHaveBeenCalled();
});
it("stops on rate-limited or failed cloud sessions without reading a cloud copy", async () => {
  dep.session.mockResolvedValueOnce({ error: { status: 429 } }).mockResolvedValueOnce({ error: { status: 503 } });
  await expect(syncNow()).rejects.toThrow(/rate limited/); await expect(syncNow()).rejects.toThrow(/Could not check/); expect(dep.fetch).not.toHaveBeenCalled();
});
it("rejects another authenticated owner or a mismatched local identity before upload", async () => {
  dep.session.mockResolvedValueOnce({ data: { user: { id: "other" } } }); await expect(syncNow()).rejects.toThrow(/Sign in again/);
  dep.snapshot.mockResolvedValueOnce(snapshot({ identityId: "other" })); await expect(syncNow()).rejects.toThrow(/another account/); expect(dep.fetch).not.toHaveBeenCalled();
});
it("does not upload over a newer cloud version", async () => {
  dep.fetch.mockResolvedValueOnce(Response.json({ version: 3, envelope: null })); await expect(syncNow()).rejects.toThrow(/Cloud changed/);
  expect(dep.fetch).toHaveBeenCalledTimes(1); expect(dep.fetch.mock.calls[0][1].method).toBe("GET"); expect(dep.acknowledge).not.toHaveBeenCalled();
});
it("distinguishes a clean copy from a newer unsynced local revision", async () => {
  dep.snapshot.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot()); expect(await syncNow()).toBe("Cloud copy is up to date.");
  dep.snapshot.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot({ revision: 5, dirty: true })); expect(await syncNow()).toMatch(/waiting to sync/);
  expect(dep.fetch.mock.calls.every(call => call[1].method === "GET")).toBe(true);
});
it("does not upload if the account connection changes while encryption is in progress", async () => {
  dep.snapshot.mockResolvedValueOnce(snapshot({ dirty: true })).mockResolvedValueOnce(snapshot({ dirty: true, generation: "other" }));
  expect(await syncNow()).toMatch(/Cloud connection changed/); expect(dep.fetch).toHaveBeenCalledTimes(1); expect(dep.acknowledge).not.toHaveBeenCalled();
});
it("stops an in-flight upload if the device signs out before the write", async () => {
  dep.snapshot.mockResolvedValueOnce(snapshot({ dirty: true })).mockResolvedValueOnce({ data, signedOut: true });
  expect(await syncNow()).toBe("Signed out. Cloud sync is paused."); expect(dep.fetch).toHaveBeenCalledTimes(1);
});
it("reports queued edits instead of claiming that a newer local revision was uploaded", async () => {
  dep.snapshot.mockResolvedValue(snapshot({ dirty: true })); dep.fetch.mockResolvedValueOnce(Response.json({ version: 2, envelope: null })).mockResolvedValueOnce(Response.json({ version: 3 })); dep.acknowledge.mockResolvedValueOnce("queued");
  expect(await syncNow()).toBe("Cloud copy saved; newer local changes are queued."); expect(dep.fetch.mock.calls.map(call => call[1].method)).toEqual(["GET", "PUT"]); expect(dep.acknowledge).toHaveBeenCalledOnce();
});
it("maps server errors to safe messages without exposing backend details", async () => {
  for (const [status, text] of [[401, "Sign in again"], [409, "Cloud changed"], [503, "Cloud is unavailable"]] as const) {
    dep.fetch.mockResolvedValueOnce(Response.json({ detail: "private backend details" }, { status })); await expect(vault("GET")).rejects.toThrow(text);
  }
});
