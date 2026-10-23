import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSession: vi.fn(), signIn: { email: vi.fn() }, signUp: { email: vi.fn() } }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => api }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import { unlockLocalVault as cloudUnlock } from "../lib/db";
import { seedVault } from "./storage-fixtures";
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
  await seedVault(data, code);
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
    await expect(cloud.unseal(await cloud.seal({ ...data, identity: undefined }, key), key)).rejects.toThrow("Invalid cloud copy");
  });
  it("signs in existing users; creates only on explicit enable and reports auth failure", async () => {
    expect((await cloud.connect(code, data)).user.id).toBe("user-1");
    api.signIn.email.mockResolvedValue({ data: null, error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" } });
    expect((await cloud.connect(code, data, true)).user.id).toBe("user-1");
    expect(api.signUp.email).toHaveBeenCalledWith(expect.objectContaining({ name: "devo" }));
    api.signUp.email.mockResolvedValue({ data: null, error: {} });
    await expect(cloud.connect(code, data, true)).rejects.toThrow("Could not create your account");
    await expect(cloud.connect(code, data)).rejects.toThrow("Could not sign in");
    api.signIn.email.mockResolvedValue({ data: null, error: { status: 429 } });
    await expect(cloud.connect(code, data)).rejects.toThrow("Too many sign-in attempts");
  });
  it.each([403, 409, 429, 500, 503, undefined])("does not attempt account creation after an authentication failure with status %s", async status => {
    api.signIn.email.mockResolvedValue({ data: null, error: { status, message: "PRIVATE_SERVER_DETAIL" } });
    await expect(cloud.connect(code, data, true)).rejects.toThrow(status === 429 ? /Too many/ : status && status >= 500 ? /service is unavailable/ : /Could not create your account/);
    expect(api.signUp.email).not.toHaveBeenCalled();
  });
  it("does not create an account for other unauthorised responses", async () => {
    api.signIn.email.mockResolvedValue({ data: null, error: { status: 401, code: "SESSION_EXPIRED" } });
    await expect(cloud.connect(code, data, true)).rejects.toThrow("Could not create your account");
    expect(api.signUp.email).not.toHaveBeenCalled();
  });
  it.each([429, 503, 400])("reports signup status %s without blaming a user-supplied recovery code or revealing server details", async status => {
    api.signIn.email.mockResolvedValue({ data: null, error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" } });
    api.signUp.email.mockResolvedValue({ data: null, error: { status, message: "PRIVATE_SERVER_DETAIL" } });
    let failure: Error | undefined;
    try { await cloud.connect(code, data, true); } catch (error) { failure = error as Error; }
    expect(failure?.message).toMatch(status === 429 ? /Too many/ : status === 503 ? /service is unavailable/ : /Could not create your account/);
    expect(failure?.message).not.toMatch(/recovery code|PRIVATE_SERVER_DETAIL/);
    expect(api.signUp.email).toHaveBeenCalledOnce();
  });
  it("reports unreachable authentication without attempting signup", async () => {
    api.signIn.email.mockRejectedValue(new TypeError("PRIVATE_NETWORK_DETAIL"));
    await expect(cloud.connect(code, data, true)).rejects.toThrow("Could not reach Drip");
    expect(api.signUp.email).not.toHaveBeenCalled();
  });
  it("preserves local device safety errors and does not retry them as signup", async () => {
    api.signIn.email.mockRejectedValue(new Error("Device session changed. Try signing in again."));
    await expect(cloud.connect(code, data, true)).rejects.toThrow("Device session changed");
    expect(api.signUp.email).not.toHaveBeenCalled();
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
    await seedVault(data, code);
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
    await cloudUnlock(code);
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
    await saveData({ ...data, identity: { ...data.identity!, id: "8f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a11" } });
    await expect(cloud.syncNow()).rejects.toThrow("another account");
  });
  it.each([429, 503])("keeps queued data and reports a temporary session-check failure (%s) without asking for another login", async status => {
    await configured(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    api.getSession.mockResolvedValue({ data: null, error: { status } });
    await expect(cloud.syncNow()).rejects.toThrow(status === 429 ? "temporarily rate limited" : "Could not check cloud sign-in");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await cloud.readCloudState())?.dirty).toBe(true);
    expect(await loadData()).toEqual(data);
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

const privateAccount = {
  id: "account-1", provider: "Zopa", label: "DEVICE_PRIVATE_NICKNAME", balance: 3000, ratePct: 7,
  rateType: "interest" as const, frequency: "monthly" as const, nextPayoutDate: "2030-01-01", colour: "#2b2d86", createdAt: "2026-01-01",
  payouts: [{ date: "2026-01-01", amount: 1, kind: "actual" as const }],
  events: [{ date: "2026-01-01", amount: 200, type: "topup" as const }], rateHistory: [{ from: "2026-01-01", ratePct: 7 }],
};
const labelled: AppData = { ...data, accounts: [privateAccount], snapshots: [{ month: "2026-01", totalBalance: 3000, monthlyIncome: 17.5 }], projection: { monthlyDeposit: 200, years: 1 } };
async function rawCloudPayload(envelope: cloud.Envelope) {
  const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv), additionalData: new TextEncoder().encode("drip-cloud-v1") }, key, bytes(envelope.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function legacyEnvelope(value: AppData, encryptionKey = key): Promise<cloud.Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("drip-cloud-v1") }, encryptionKey, new TextEncoder().encode(JSON.stringify(value)));
  return { app: "drip-cloud", v: 1, iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...new Uint8Array(ct))) };
}
describe("device-only nickname boundary", () => {
  it("keeps selected/custom holding identities and edited colours in encrypted recovery while nicknames remain private", async () => {
    for (const holdingName of ["Realty Income", "Custom investment trust"]) {
      const input = { ...labelled, accounts: [{ ...privateAccount, productCategory: "stocks-funds" as const, provider: "Trading212", holdingName, colour: "#ffeedd" }] };
      const sealed = await cloud.seal(input, key);
      expect(JSON.stringify(sealed)).not.toContain(holdingName);
      const restored = await cloud.unseal(sealed, key);
      expect(restored.accounts[0]).toMatchObject({ holdingName, colour: "#ffeedd", label: "", provider: "Trading212" });
      expect(input.accounts[0].label).toBe("DEVICE_PRIVATE_NICKNAME");
    }
  });
  it("round-trips financial product and income fields while excluding new nested private fields", async () => {
    const input = { ...labelled, accounts: [{ ...privateAccount, productCategory: "cash-isa" as const, taxWrapper: "cash-isa" as const, reinvestIncome: true,
      bonus: { amount: 15.44, expectedDate: "2030-05-06", note: "PRIVATE_BONUS_NOTE" },
      payouts: [{ date: "2026-09-30", amount: 22.65, kind: "actual" as const, incomeType: "interest" as const, note: "PRIVATE_RECEIPT_NOTE" }] }] };
    const envelope = await cloud.seal(input, key);
    const portable = await rawCloudPayload(envelope);
    expect(JSON.stringify(portable)).not.toMatch(/PRIVATE_|DEVICE_PRIVATE|"label"|"note"/);
    const restored = await cloud.unseal(envelope, key);
    expect(restored.accounts[0]).toMatchObject({ productCategory: "cash-isa", taxWrapper: "cash-isa", reinvestIncome: true,
      bonus: { amount: 15.44, expectedDate: "2030-05-06" }, payouts: [{ date: "2026-09-30", amount: 22.65, kind: "actual", incomeType: "interest" }], label: "" });
  });
  it("omits nicknames, locks and unknown local fields from the actual encrypted payload without changing local data", async () => {
    const input = { ...labelled, localNote: "PRIVATE_ROOT_NOTE", lock: { credentialId: "PRIVATE_CREDENTIAL", enabledAt: "now" }, accounts: [{ ...privateAccount, localNote: "PRIVATE_ACCOUNT_NOTE", events: [{ ...privateAccount.events[0], note: "PRIVATE_EVENT_NOTE" }] }] };
    const envelope = await cloud.seal(input, key); const portable = await rawCloudPayload(envelope);
    expect(JSON.stringify(portable)).not.toMatch(/DEVICE_PRIVATE|PRIVATE_|"label"|"lock"|"localNote"/);
    const recovered = await cloud.unseal(envelope, key);
    expect(recovered.accounts[0]).toEqual({ ...privateAccount, label: "" });
    expect(recovered.snapshots).toEqual(labelled.snapshots); expect(recovered.projection).toEqual(labelled.projection);
    expect(input.accounts[0].label).toBe("DEVICE_PRIVATE_NICKNAME");
  });
  it("drops nicknames from older cloud copies restored onto a fresh device", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 1, envelope: await legacyEnvelope(labelled) })));
    const restored = await cloud.restoreCloud(code);
    expect(restored.accounts[0].label).toBe(""); expect((await loadData()).accounts[0].balance).toBe(3000);
  });
  it("preserves this unlocked device's nicknames when restoring the same account", async () => {
    await seedVault(labelled, code);
    const remote = { ...labelled, accounts: [{ ...privateAccount, label: "OLD_REMOTE_NICKNAME", balance: 4200 }] };
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 2, envelope: await legacyEnvelope(remote) })));
    expect((await cloud.restoreCloud(code)).accounts[0]).toMatchObject({ label: "DEVICE_PRIVATE_NICKNAME", balance: 4200 });
    expect((await loadData()).accounts[0].label).toBe("DEVICE_PRIVATE_NICKNAME");
  });
  it("does not carry local nicknames into a different account even when an account id matches", async () => {
    await seedVault(labelled, code);
    const other = { ...labelled, identity: { ...data.identity!, id: "7f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10" } };
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 1, envelope: await legacyEnvelope(other) })));
    expect((await cloud.restoreCloud(code)).accounts[0].label).toBe("");
  });
  it("does not carry nicknames across recovery roots even if a backup reused the identity id", async () => {
    await seedVault(labelled, code);
    const otherCode = generateRecoveryCode(); const otherKey = await cloud.cloudKey(otherCode);
    const credentials = await cloud.recoveryCredentials(otherCode);
    api.signIn.email.mockResolvedValue({ data: { user: { id: "user-2", email: credentials.email } }, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 1, envelope: await legacyEnvelope(labelled, otherKey) })));
    expect((await cloud.restoreCloud(otherCode)).accounts[0].label).toBe("");
  });
  it("cleans an older cloud copy on the next sync even without queued edits, keeping local nicknames", async () => {
    await seedVault(labelled, code);
    await cloud.writeCloudState({ userId: "user-1", identityId: data.identity!.id, key, version: 1, dirty: false, lastSyncAt: null, generation: "first", revision: 0 });
    let envelope = await legacyEnvelope(labelled); let version = 1;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "PUT") { envelope = JSON.parse(options.body as string).envelope; version++; }
      return response({ version, envelope });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await cloud.syncNow()).toBe("Encrypted cloud copy saved.");
    expect(await rawCloudPayload(envelope)).not.toHaveProperty("accounts.0.label");
    expect((await loadData()).accounts[0].label).toBe("DEVICE_PRIVATE_NICKNAME");
    expect(await cloud.syncNow()).toBe("Cloud copy is up to date."); expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
