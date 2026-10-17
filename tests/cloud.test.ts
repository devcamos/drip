import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSession: vi.fn(), signIn: { email: vi.fn() }, signUp: { email: vi.fn() } }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => api }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import * as cloud from "../lib/cloud";
import { emptyData, getItem, loadData, saveData, cloudSnapshot, acknowledgeCloudUpload, commitCloudRestore, setItem } from "../lib/db";
import { generateRecoveryCode } from "../lib/crypto";
import type { AppData } from "../lib/types";

const code = generateRecoveryCode(); let key: CryptoKey; let email: string;
const data: AppData = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "devo", createdAt: "2026-10-15" } };
beforeAll(async () => { key = await cloud.cloudKey(code); email = (await cloud.recoveryCredentials(code)).email; });
beforeEach(() => {
  vi.clearAllMocks();
  api.getSession.mockResolvedValue({ data: { user: { id: "user-1", email } } });
  api.signIn.email.mockResolvedValue({ data: { user: { id: "user-1", email } }, error: null });
  api.signUp.email.mockResolvedValue({ data: { user: { id: "user-1", email } }, error: null });
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function configured(dirty = true) {
  await saveData(data);
  await cloud.writeCloudState({ userId: "user-1", identityId: data.identity!.id, key, version: 1, dirty, lastSyncAt: null, generation: "first", revision: 0 });
}

describe("encrypted recovery", () => {
  it("normalises recovery codes, separates auth from encryption, and never exports the key", async () => {
    expect(await cloud.recoveryCredentials(code.toLowerCase().replaceAll("-", " "))).toEqual(await cloud.recoveryCredentials(code));
    expect(email).not.toContain(code); expect(key.extractable).toBe(false);
    await expect(cloud.recoveryCredentials("wrong")).rejects.toThrow("complete recovery code");
    await expect(cloud.cloudKey("wrong")).rejects.toThrow("complete recovery code");
  });
  it("encrypts portable accounts, rejects wrong keys/tampering, and drops device locks", async () => {
    const sealed = await cloud.seal({ ...data, lock: { credentialId: "device-only", enabledAt: "now" } }, key);
    expect(JSON.stringify(sealed)).not.toContain("devo");
    expect((await cloud.unseal(sealed, key)).identity).toEqual(data.identity);
    expect((await cloud.unseal(sealed, key)).lock).toBeUndefined();
    await expect(cloud.unseal(sealed, await cloud.cloudKey(generateRecoveryCode()))).rejects.toThrow();
    await expect(cloud.unseal({ ...sealed, ct: sealed.ct.slice(4) }, key)).rejects.toThrow();
    await expect(cloud.unseal({ ...sealed, v: 2 } as any, key)).rejects.toThrow("Unsupported");
    await expect(cloud.unseal(await cloud.seal({ version: 9 } as any, key), key)).rejects.toThrow("Invalid cloud copy");
  });
  it("signs in existing users; creates only on explicit enable and reports auth failure", async () => {
    expect((await cloud.connect(code, data)).user.id).toBe("user-1");
    api.signIn.email.mockResolvedValue({ data: null, error: { message: "no" } });
    expect((await cloud.connect(code, data, true)).user.id).toBe("user-1");
    expect(api.signUp.email).toHaveBeenCalledWith(expect.objectContaining({ name: "devo" }));
    api.signUp.email.mockResolvedValue({ data: null, error: {} });
    await expect(cloud.connect(code, data, true)).rejects.toThrow("Could not sign in");
    await expect(cloud.connect(code, data)).rejects.toThrow("Could not sign in");
    api.signIn.email.mockResolvedValue({ data: null, error: { status: 429 } });
    await expect(cloud.connect(code, data)).rejects.toThrow("Too many sign-in attempts");
  });
  it("restores after local data loss using code, including a matching passkey session", async () => {
    const envelope = await cloud.seal(data, key);
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 5, envelope, updated_at: "2026-10-17" })));
    expect((await cloud.restoreCloud(code)).identity?.handle).toBe("devo");
    expect((await loadData()).identity?.id).toBe(data.identity!.id);
    expect((await cloud.readCloudState())?.version).toBe(5);
    expect((await cloud.readCloudState())?.dirty).toBe(false);
    await cloud.restoreCloud(code, "user-1");
    api.getSession.mockResolvedValue({ data: { user: { id: "other", email: "other@recovery.drip.invalid" } } });
    await expect(cloud.restoreCloud(code, "other")).rejects.toThrow("different account");
  });
  it("does not replace local data for a missing cloud copy or a failed decryption", async () => {
    await saveData(data);
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 0, envelope: null })));
    await expect(cloud.restoreCloud(code)).rejects.toThrow("No cloud copy");
    expect((await loadData()).identity).toEqual(data.identity);
  });
  it.each([401, 409, 503])("reports HTTP %s without clearing local data", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, status)));
    await expect(cloud.vault()).rejects.toThrow();
  });
});

describe("versioned offline sync", () => {
  it("marks offline writes dirty in the same transaction and preserves the key", async () => {
    await configured(false); await saveData({ ...data, lastBackupAt: "changed" });
    const state = await cloud.readCloudState();
    expect(state?.dirty).toBe(true); expect(state?.key.extractable).toBe(false);
    expect((await getItem<AppData>("data"))?.lastBackupAt).toBe("changed");
  });
  it("atomically keeps later edits queued and ignores an old connection acknowledgement", async () => {
    await configured();
    const snapshot = await cloudSnapshot();
    await saveData({ ...data, lastBackupAt: "later-edit" });
    expect(await acknowledgeCloudUpload(snapshot.state!, 2, "now")).toBe("queued");
    expect((await cloud.readCloudState())?.dirty).toBe(true);
    expect((await cloud.readCloudState())?.version).toBe(2);
    const reconnected = { ...snapshot.state!, generation: "new", version: 5 };
    await cloud.writeCloudState(reconnected);
    expect(await acknowledgeCloudUpload(snapshot.state!, 2, "now")).toBe("changed");
    expect((await cloud.readCloudState())?.generation).toBe("new");
    await cloud.writeCloudState(undefined);
    expect(await acknowledgeCloudUpload(snapshot.state!, 2, "now")).toBe("changed");
  });
  it("pauses sync while signed out and does not upload if sign-out starts during encryption", async () => {
    await configured(); await setItem("deviceSession", { signedOut: true, generation: "out" });
    expect(await cloud.syncNow()).toContain("paused"); expect(api.getSession).not.toHaveBeenCalled();
    await setItem("deviceSession", { signedOut: false, generation: "in" });
    vi.stubGlobal("fetch", vi.fn(async () => { await setItem("deviceSession", { signedOut: true, generation: "out-again" }); return response({ version: 1 }); }));
    expect(await cloud.syncNow()).toContain("paused"); expect(fetch).toHaveBeenCalledOnce();
    await expect(cloud.restoreCloud(code)).rejects.toThrow(/Sign in before restoring/);
  });
  it("uploads an encrypted copy with its base version, then records success", async () => {
    await configured();
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "PUT" ? response({ version: 2, updated_at: "2026-10-17" }) : response({ version: 1 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await cloud.syncNow()).toBe("Encrypted cloud copy saved.");
    expect((await cloud.readCloudState())?.dirty).toBe(false);
    const body = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(body.version).toBe(1); expect(body.envelope.app).toBe("drip-cloud");
    expect(JSON.stringify(body)).not.toContain("devo");
  });
  it("does not upload discarded local data when a same-account restore completes during encryption", async () => {
    await configured();
    const restored = { ...data, lastBackupAt: "restored-cloud-copy" };
    const connection = (await cloud.readCloudState())!;
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const encrypting = vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
      const ciphertext = await encrypt(...args);
      await commitCloudRestore(restored, { ...connection, generation: "restored", dirty: false }, { salt: "test", hash: "test" });
      return ciphertext;
    });
    const fetcher = vi.fn(async () => response({ version: 1 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await cloud.syncNow()).toContain("connection changed");
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0]).toEqual(["/api/cloud", expect.objectContaining({ method: "GET" })]);
      expect(await loadData()).toEqual(restored);
      expect(await cloud.readCloudState()).toMatchObject({ generation: "restored", version: 1, dirty: false });
    } finally { encrypting.mockRestore(); }
  });
  it.each(["reconnect", "owner", "identity", "version", "disconnect"])("does not upload after a %s changes the connection during encryption", async change => {
    await configured();
    const connection = (await cloud.readCloudState())!;
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const encrypting = vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
      const ciphertext = await encrypt(...args);
      await cloud.writeCloudState(change === "disconnect" ? undefined : {
        ...connection,
        ...(change === "reconnect" ? { generation: "reconnected" } : {}),
        ...(change === "owner" ? { userId: "user-2" } : {}),
        ...(change === "identity" ? { identityId: "other-local-account" } : {}),
        ...(change === "version" ? { version: 2 } : {}),
      });
      return ciphertext;
    });
    const fetcher = vi.fn(async () => response({ version: 1 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await cloud.syncNow()).toContain("connection changed");
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { encrypting.mockRestore(); }
  });
  it("keeps newer changes queued when an edit arrives during upload", async () => {
    await configured();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "PUT") { await saveData({ ...data, lastBackupAt: "newer" }); return response({ version: 2 }); }
      return response({ version: 1 });
    }));
    expect(await cloud.syncNow()).toContain("queued"); expect((await cloud.readCloudState())?.dirty).toBe(true);
  });
  it("refuses stale uploads, another user's session and a foreign local backup", async () => {
    await configured(); const fetcher = vi.fn(async () => response({ version: 3 })); vi.stubGlobal("fetch", fetcher);
    await expect(cloud.syncNow()).rejects.toThrow("Cloud changed"); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await cloud.readCloudState())?.dirty).toBe(true);
    api.getSession.mockResolvedValue({ data: null });
    await expect(cloud.syncNow()).rejects.toThrow("Sign in again");
    api.getSession.mockResolvedValue({ data: { user: { id: "user-1" } } });
    await saveData({ ...data, identity: { ...data.identity!, id: "other" } });
    await expect(cloud.syncNow()).rejects.toThrow("another account");
  });
  it("doesn't upload clean data, disabled sync or a second in-flight operation", async () => {
    expect(await cloud.syncNow()).toContain("off");
    await configured(false); vi.stubGlobal("fetch", vi.fn(async () => response({ version: 1 })));
    expect(await cloud.syncNow()).toContain("up to date");
    let release!: (value: any) => void;
    api.getSession.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = cloud.syncNow();
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(await cloud.syncNow()).toContain("in progress"); release({ data: { user: { id: "user-1" } } }); await pending;
  });
});
