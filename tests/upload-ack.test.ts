import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => auth }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import { cloudKey, readCloudState, syncNow } from "../lib/cloud";
import { acknowledgeCloudUpload, cloudSnapshot, commitCloudRestore, completeDeviceSession, emptyData, loadData, localVaultStatus, saveData, setItem, unlockLocalVault } from "../lib/db";
import { codeVerifier } from "../lib/crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import type { AppData } from "../lib/types";
const data: AppData = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "2026-10-20" } };
beforeEach(async () => {
  auth.getSession.mockResolvedValue({ data: { user: { id: "owner" } } });
  await seedVault(data, fixtureCode, { userId: "owner", identityId: data.identity!.id, key: await cloudKey(fixtureCode), version: 1, dirty: true, lastSyncAt: null, generation: "connection", revision: 0 });
});
describe("upload acknowledgement across local locking", () => {
  it("records a successful in-flight PUT after sign-out without reopening the vault or creating a false conflict", async () => {
    let version = 1;
    vi.stubGlobal("fetch", vi.fn(async (_: unknown, init: RequestInit) => {
      if (init.method === "PUT") {
        version = 2;
        await setItem("deviceSession", { signedOut: true, remotePending: true, generation: "out" });
      }
      return Response.json({ version, updated_at: "2026-10-20" });
    }));
    expect(await syncNow()).toBe("Encrypted cloud copy saved.");
    const stored = await rawStore();
    expect(stored.cloudState).toMatchObject({ version: 2, dirty: false, lastSyncAt: "2026-10-20" });
    expect(stored.cloudState).not.toHaveProperty("vaultId");
    expect(stored.cloudState).not.toHaveProperty("key");
    expect(stored.deviceSession).toEqual({ signedOut: true, remotePending: true, generation: "out" });
    expect(await localVaultStatus()).toBe("locked");
    await expect(loadData()).rejects.toThrow(/Unlock/);
    await unlockLocalVault(fixtureCode);
    await completeDeviceSession("out", { signedOut: false, remotePending: false, generation: "out" });
    expect(await syncNow()).toBe("Cloud copy is up to date.");
    expect((await readCloudState())?.version).toBe(2);
  });
  it("preserves newer edits and all encrypted records while signed out", async () => {
    const snapshot = await cloudSnapshot();
    await saveData({ ...data, lastBackupAt: "later-local-edit" });
    await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "out" });
    const before = await rawStore();
    expect(await acknowledgeCloudUpload(snapshot.state!, 2, "now")).toBe("queued");
    const after = await rawStore();
    expect(after.cloudState).toMatchObject({ version: 2, dirty: true, revision: 1 });
    expect({ ...after, cloudState: undefined }).toEqual({ ...before, cloudState: undefined });
  });
  it.each(["vault", "owner", "identity", "generation", "version", "disconnect"])("ignores stale acknowledgement after %s replacement", async change => {
    const snapshot = await cloudSnapshot(); const current = await rawStore();
    if (change === "vault") {
      // Same cloud owner, identity and version still cannot bind an older local vault.
      await commitCloudRestore(data, snapshot.state, await codeVerifier(fixtureCode), undefined, undefined, fixtureCode);
    } else {
      const state = { ...current.cloudState };
      if (change === "owner") state.userId = "other-owner";
      if (change === "identity") state.identityId = "other-identity";
      if (change === "generation") state.generation = "reconnected";
      if (change === "version") state.version = 4;
      await rawStore({ cloudState: change === "disconnect" ? undefined : state });
    }
    await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "changed-session" });
    const before = await rawStore();
    expect(await acknowledgeCloudUpload(snapshot.state!, 2, "now")).toBe("changed");
    expect(await rawStore()).toEqual(before);
    expect(await localVaultStatus()).toBe("locked");
  });
  it("rejects an acknowledgement without its original vault binding", async () => {
    const snapshot = await cloudSnapshot();
    const { vaultId: _, ...missing } = snapshot.state!;
    const before = await rawStore();
    // Runtime defense for stale clients or untyped callers; production callers require vaultId.
    // @ts-expect-error the acknowledgement binding is mandatory
    expect(await acknowledgeCloudUpload(missing, 2, "now")).toBe("changed");
    expect(await rawStore()).toEqual(before);
  });
});
