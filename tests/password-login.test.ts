import { beforeEach, expect, it, vi } from "vitest";
const cloud = vi.hoisted(() => ({ connect: vi.fn(), readCloudState: vi.fn(), syncNow: vi.fn(), vault: vi.fn(), writeCloudState: vi.fn(), recoveryCredentials: vi.fn(), seal: vi.fn(), authClient: { signOut: vi.fn() }, restoreCloud: vi.fn() }));
const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/cloud", () => cloud);
vi.mock("../lib/worker-safety", () => ({ safeFetch: request }));
import { loginTag, passwordError, passwordProof, unwrapPasswordRoot, validPasswordWrap, wrapPasswordRoot } from "../lib/password-crypto";
import { setLoginPassword, signInPassword, passwordUsername, signUpPassword, passwordRecoveryRoot } from "../lib/password-login";
import { emptyData, loadData, lockLocalVault, passwordUnlockContext, savePasswordUnlock, setItem, getItem, commitCloudRestore } from "../lib/db";
import { codeVerifier } from "../lib/crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "tester", createdAt: "now" } };
const password = "Green meadow 42!";
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: false });
  cloud.connect.mockResolvedValue({ user: { id: "owner" }, key: {} });
  cloud.readCloudState.mockResolvedValue({ userId: "owner" });
  cloud.vault.mockResolvedValue({ version: 1, envelope: { app: "drip-cloud" } });
  cloud.recoveryCredentials.mockResolvedValue({ email: "root@recovery.drip.invalid", password: "a".repeat(64) });
  cloud.syncNow.mockResolvedValue("Saved"); request.mockResolvedValue(Response.json({ saved: true }));
  await seedVault(data);
});
it("uses exact password characters and authenticates owner/username/salt with a separate login proof", async () => {
  const wrap = await wrapPasswordRoot(fixtureCode, "TeSTer", password, "owner");
  expect(loginTag(" TeSTer ")).toBe("tester"); expect(wrap.username).toBe("tester");
  expect(await unwrapPasswordRoot(wrap, "TESTER", password)).toBe(fixtureCode);
  for (const wrong of [password.toUpperCase(), "Greenmeadow42", password + " "]) await expect(unwrapPasswordRoot(wrap, "tester", wrong)).rejects.toThrow(/incorrect/);
  for (const changed of [{ ...wrap, owner: "other" }, { ...wrap, username: "other" }, { ...wrap, iter: 1 }, { ...wrap, salt: "broken" }, { ...wrap, ct: "broken" }]) await expect(unwrapPasswordRoot(changed, changed.username, password)).rejects.toThrow();
  expect(validPasswordWrap(null)).toBe(false); expect(passwordError("short")).toMatch(/12/); expect(passwordError("a".repeat(257))).toMatch(/256/);
  await expect(wrapPasswordRoot(fixtureCode, "tester", "short", "owner")).rejects.toThrow(/12/);
  await expect(wrapPasswordRoot("bad", "tester", password, "owner")).rejects.toThrow(/Invalid/);
  expect(await passwordProof("tester", password)).not.toBe(await passwordProof("other", password));
  expect(await passwordProof("tester", password)).not.toBe(await passwordProof("tester", password.toLowerCase()));
});
it("sets password without changing accounts, persists only ciphertext and supports offline sign-out return", async () => {
  await setLoginPassword(fixtureCode, "TeSTer", password, data);
  expect(await passwordUsername()).toBe("tester");
  const outbound = JSON.parse(request.mock.calls[0][1].body);
  expect(JSON.stringify(outbound)).not.toContain(password); expect(JSON.stringify(outbound)).not.toContain(fixtureCode);
  expect(outbound.proof).toBe(await passwordProof("tester", password));
  expect(await unwrapPasswordRoot(outbound.envelope, "tester", password)).toBe(fixtureCode);
  const raw = await rawStore(); expect(JSON.stringify(raw)).not.toContain(password); expect(JSON.stringify(raw)).not.toContain(fixtureCode);
  await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "out" });
  await signInPassword("TESTER", password); expect(await loadData()).toEqual(data);
  lockLocalVault(); await expect(signInPassword("tester", "wrong")).rejects.toThrow(/incorrect/);
  await expect(loadData()).rejects.toThrow(/Unlock/);
  await signInPassword("tester", password); expect(await loadData()).toEqual(data);
});
it("rejects bad setup, account conflicts and failed server setup without replacing offline unlock", async () => {
  await expect(setLoginPassword(fixtureCode, "bad tag", password, data)).rejects.toThrow(/3–16/);
  await expect(setLoginPassword(fixtureCode, "tester", "short", data)).rejects.toThrow(/12/);
  await expect(setLoginPassword("wrong", "tester", password, data)).rejects.toThrow(/recovery code/);
  cloud.readCloudState.mockResolvedValueOnce({ userId: "other" });
  await expect(setLoginPassword(fixtureCode, "tester", password, data)).rejects.toThrow(/account changed/);
  request.mockResolvedValueOnce(Response.json({ message: "Gamertag unavailable" }, { status: 409 }));
  await expect(setLoginPassword(fixtureCode, "tester", password, data)).rejects.toThrow(/unavailable/);
  expect((await passwordUnlockContext()).envelope).toBeUndefined();
  cloud.readCloudState.mockResolvedValue(undefined); cloud.vault.mockResolvedValueOnce({ version: 0 });
  await setLoginPassword(fixtureCode, "tester", password, data);
  expect(cloud.writeCloudState).toHaveBeenCalledWith(expect.objectContaining({ version: 0, dirty: true }), expect.any(Object));
});
it("authenticates online before opening a cached copy and refuses a stale response after another tab signs out", async () => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", password, "owner");
  await savePasswordUnlock(envelope, (await passwordUnlockContext()).binding!); lockLocalVault();
  vi.stubGlobal("navigator", { onLine: true });
  request.mockResolvedValueOnce(Response.json({ message: "Gamertag or password is incorrect." }, { status: 401 }));
  await expect(signInPassword("tester", password)).rejects.toThrow(/incorrect/); await expect(loadData()).rejects.toThrow(/Unlock/);
  request.mockImplementationOnce(async () => { await setItem("deviceSession", { signedOut: true, generation: "other-tab" }); return Response.json({ owner: "owner", envelope }); });
  await expect(signInPassword("tester", password)).rejects.toThrow(/session changed/);
  await expect(loadData()).rejects.toThrow(/Unlock/);
});
it("restores a fresh browser with just gamertag and password", async () => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", password, "owner");
  lockLocalVault(true);
  await new Promise(resolve => { const r = indexedDB.deleteDatabase("drip"); r.onsuccess = r.onerror = () => resolve(null); });
  vi.stubGlobal("navigator", { onLine: true });
  request.mockResolvedValueOnce(Response.json({ owner: "owner", envelope }));
  cloud.restoreCloud.mockImplementationOnce(async (root: string, _user: unknown, generation: string) => {
    expect(root).toBe(fixtureCode); await commitCloudRestore(data, undefined, await codeVerifier(root), generation, generation, root); return data;
  });
  await signInPassword("tester", password); expect(await loadData()).toEqual(data); expect(await passwordUsername()).toBe("tester");
});
it("requires a connection for first-time login and never restores over an existing vault implicitly", async () => {
  await expect(signInPassword("bad tag", password)).rejects.toThrow(/incorrect/);
  await expect(signInPassword("tester", password)).rejects.toThrow(/internet/);
  const { generateRecoveryCode } = await import("../lib/crypto");
  const other = await wrapPasswordRoot(generateRecoveryCode(), "other", password, "other-owner");
  vi.stubGlobal("navigator", { onLine: true }); request.mockResolvedValueOnce(Response.json({ owner: "other-owner", envelope: other }));
  await expect(signInPassword("other", password)).rejects.toThrow(/different account/);
  expect(await loadData()).toEqual(data); expect(cloud.restoreCloud).not.toHaveBeenCalled();
});

async function freshSignupDevice() {
  lockLocalVault(true);
  await new Promise(resolve => { const r = indexedDB.deleteDatabase("drip"); r.onsuccess = r.onerror = () => resolve(null); });
  vi.stubGlobal("navigator", { onLine: true });
  cloud.seal.mockResolvedValue({ app: "drip-cloud", v: 1, ct: "synthetic" });
  cloud.vault.mockImplementation(async (method: string) => method === "PUT" ? { version: 1 } : { version: 0, envelope: null });
}
it("registers password access before atomically installing encrypted local signup and offline unlock", async () => {
  await freshSignupDevice();
  request.mockImplementationOnce(async () => { expect((await passwordUnlockContext()).binding).toBeUndefined(); expect(await getItem("verifier")).toBeUndefined(); return Response.json({ saved: true }); });
  await signUpPassword("tester", password, data);
  expect(await loadData()).toEqual(data); expect(await passwordUsername()).toBe("tester");
  const raw = JSON.stringify(await rawStore()); expect(raw).not.toContain(password);
  const root = await passwordRecoveryRoot(password); expect(raw).not.toContain(root);
  await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "new-out" });
  vi.stubGlobal("navigator", { onLine: false }); await signInPassword("tester", password); expect(await loadData()).toEqual(data);
});
it("keeps failed signup off Accounts without leaving a local vault that cannot be unlocked", async () => {
  await freshSignupDevice();
  request.mockResolvedValueOnce(Response.json({ message: "Gamertag is taken" }, { status: 409 }));
  await expect(signUpPassword("tester", password, data)).rejects.toThrow(/taken/);
  expect((await passwordUnlockContext()).binding).toBeUndefined(); expect(await getItem("verifier")).toBeUndefined();
  expect(await loadData()).toEqual(emptyData());
});
it("never replaces an account created in another tab during signup", async () => {
  await freshSignupDevice();
  const other = { ...data, identity: { ...data.identity, handle: "other" } };
  request.mockImplementationOnce(async () => { await seedVault(other); return Response.json({ saved: true }); });
  await expect(signUpPassword("tester", password, data)).rejects.toThrow(/already has an account/);
  expect(await loadData()).toEqual(other);
});
it("requires the correct current password to prepare recovery codes, without exposing the root in storage", async () => {
  await setLoginPassword(fixtureCode, "tester", password, data);
  await expect(passwordRecoveryRoot("wrong password")).rejects.toThrow(/incorrect/);
  expect(await passwordRecoveryRoot(password)).toBe(fixtureCode);
  await setItem("verifier", await codeVerifier((await import("../lib/crypto")).generateRecoveryCode()));
  await expect(passwordRecoveryRoot(password)).rejects.toThrow(/Account changed/);
});
