import { beforeEach, expect, it, vi } from "vitest";
import { originalRecoveryCodes } from "../lib/original-recovery-codes";
import { createRecoveryCodes, type RecoveryRecord } from "../lib/recovery-codes";
import { emptyData, getItem, lockLocalVault, passwordUnlockContext, rememberOriginalRecoveryCodes, unlockLocalVault } from "../lib/db";
import * as db from "../lib/db";
import { encryptBackup } from "../lib/crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

let registered: RecoveryRecord[] | undefined;
let loseResponse = false;
beforeEach(async () => {
  registered = undefined; loseResponse = false;
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  await seedVault(emptyData(), fixtureCode, { userId: "owner", identityId: "id", key: {} as CryptoKey, version: 1, dirty: false, generation: "cloud", revision: 0, lastSyncAt: null });
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init.method === "GET") return Response.json({ locators: registered?.map(record => record.locator) ?? null });
    const incoming = JSON.parse(init.body).records;
    if (registered && !incoming.every((record: RecoveryRecord) => registered!.some(original => original.locator === record.locator))) return Response.json({ code: "RECOVERY_CODES_EXIST" }, { status: 409 });
    registered ??= incoming;
    if (loseResponse) { loseResponse = false; throw new Error("Synthetic lost response"); }
    return Response.json({ saved: true });
  }));
});

it("keeps one encrypted original file and downloads the same codes after relocking", async () => {
  const first = await originalRecoveryCodes(fixtureCode, "owner");
  expect(new Set(first.codes).size).toBe(6);
  const raw = JSON.stringify(await rawStore());
  for (const secret of [fixtureCode, ...first.codes]) expect(raw).not.toContain(secret);
  expect(await getItem("originalRecoveryCodes:owner")).toBeDefined();
  lockLocalVault(); await unlockLocalVault(fixtureCode);
  expect((await originalRecoveryCodes(fixtureCode, "owner")).codes).toEqual(first.codes);
  expect(registered).toHaveLength(6);
});

it("retains the original encrypted file before a lost registration response and retries that set", async () => {
  loseResponse = true;
  await expect(originalRecoveryCodes(fixtureCode, "owner")).rejects.toThrow(/lost response/);
  const file = await getItem("originalRecoveryCodes:owner"); const first = registered;
  expect(file).toBeDefined();
  const retried = await originalRecoveryCodes(fixtureCode, "owner");
  expect(retried.codes).toHaveLength(6);
  expect(registered).toEqual(first);
  expect(await getItem("originalRecoveryCodes:owner")).toEqual(file);
});

it("refuses a second set on a new device lacking the original file", async () => {
  registered = (await createRecoveryCodes(fixtureCode)).records;
  await expect(originalRecoveryCodes(fixtureCode, "owner")).rejects.toThrow(/Another set cannot be created/);
  expect(fetch).toHaveBeenCalledOnce();
  expect(await getItem("originalRecoveryCodes:owner")).toBeUndefined();
});

it("does not register anything when the encrypted original cannot be retained", async () => {
  vi.spyOn(db, "rememberOriginalRecoveryCodes").mockRejectedValueOnce(new Error("Synthetic quota"));
  await expect(originalRecoveryCodes(fixtureCode, "owner")).rejects.toThrow(/quota/);
  expect(registered).toBeUndefined(); expect(fetch).toHaveBeenCalledOnce();
});

it("atomically retains only one encrypted candidate across competing tabs", async () => {
  const { binding } = await passwordUnlockContext();
  const a = await encryptBackup({ candidate: "A" }, fixtureCode); const b = await encryptBackup({ candidate: "B" }, fixtureCode);
  const results = await Promise.all([rememberOriginalRecoveryCodes("owner", a, binding!), rememberOriginalRecoveryCodes("owner", b, binding!)]);
  expect(results[0]).toEqual(results[1]);
  expect(await getItem("originalRecoveryCodes:owner")).toEqual(results[0]);
  await expect(rememberOriginalRecoveryCodes("other", a, binding!)).rejects.toThrow(/Cloud account changed/);
});

it("rejects a wrong root before contacting the server and stops if the account changes during status", async () => {
  await expect(originalRecoveryCodes("BBBB-CCCC-DDDD-EEEE-FFFF-GGGG", "owner")).rejects.toThrow(/Confirm/);
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockImplementationOnce(async () => { await seedVault(); return Response.json({ locators: null }); });
  await expect(originalRecoveryCodes(fixtureCode, "owner")).rejects.toThrow(/changed/);
  expect(registered).toBeUndefined();
});

it("bounds status requests with the caller's abort signal", async () => {
  const controller = new AbortController(); controller.abort(new Error("Synthetic timeout"));
  vi.mocked(fetch).mockImplementationOnce(async (_input, init) => { init!.signal!.throwIfAborted(); return Response.json({ locators: null }); });
  await expect(originalRecoveryCodes(fixtureCode, "owner", controller.signal)).rejects.toThrow(/timeout/);
  expect(registered).toBeUndefined();
});

it("releases the caller at its deadline even if a private request is stuck waiting", async () => {
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = originalRecoveryCodes(fixtureCode, "owner", controller.signal);
  const rejected = expect(pending).rejects.toThrow(/Synthetic deadline/);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  controller.abort(new Error("Synthetic deadline"));
  await rejected;
  expect(registered).toBeUndefined();
});
