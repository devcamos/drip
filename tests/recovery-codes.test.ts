import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecoveryCodes, recoveryLocator, registerRecoveryCodes, resolveRecoveryCode } from "../lib/recovery-codes";
import { generateRecoveryCode, encryptBackup, isValidCode } from "../lib/crypto";
import * as db from "../lib/db";
import { getItem, setItem } from "../lib/db";
const root = generateRecoveryCode();
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
describe("six alternative recovery codes", () => {
  it("generates six unique codes that all unwrap the same root, without sending raw codes", async () => {
    const pack = await createRecoveryCodes(root);
    expect(new Set(pack.codes).size).toBe(6);
    expect(pack.codes.every(isValidCode)).toBe(true);
    for (const code of pack.codes) {
      const locator = await recoveryLocator(code);
      const record = pack.records.find(r => r.locator === locator)!;
      vi.mocked(fetch).mockResolvedValue(Response.json({ envelope: record.envelope }));
      expect(await resolveRecoveryCode(code.toLowerCase())).toBe(root);
      expect(vi.mocked(fetch).mock.lastCall![1]?.body).toBe(JSON.stringify({ locator }));
      expect(JSON.stringify(record)).not.toContain(root);
    }
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await resolveRecoveryCode(pack.codes[0])).toBe(root);
    expect(await resolveRecoveryCode(root)).toBe(root);
  });
  it("rejects invalid, unknown, tampered and foreign-purpose wrappers", async () => {
    await expect(resolveRecoveryCode("DRIP2-ABC")).rejects.toThrow(/complete/);
    const code = `DRIP2-${generateRecoveryCode()}`;
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(resolveRecoveryCode(code)).rejects.toThrow(/not found/);
    const envelope = await encryptBackup({ purpose: "other", root }, code);
    vi.mocked(fetch).mockResolvedValue(Response.json({ envelope }));
    await expect(resolveRecoveryCode(code)).rejects.toThrow(/Invalid recovery/);
    vi.mocked(fetch).mockResolvedValue(Response.json({ envelope: { ...envelope, ct: "AAAA" } }));
    await expect(resolveRecoveryCode(code)).rejects.toThrow(/Wrong recovery/);
  });
  it("replaces cached records that share a locator and keeps the rest, newest last", async () => {
    await setItem("recoveryRecords", [{ locator: "a", envelope: { v: 1 } }, { locator: "b", envelope: { v: 1 } }]);
    vi.mocked(fetch).mockResolvedValue(Response.json({ saved: true }));
    const fresh = [{ locator: "b", envelope: { v: 2 } }, { locator: "c", envelope: { v: 2 } }] as never;
    expect(await registerRecoveryCodes(fresh, "owner")).toBe(true);
    expect(await getItem("recoveryRecords")).toEqual([{ locator: "a", envelope: { v: 1 } }, { locator: "b", envelope: { v: 2 } }, { locator: "c", envelope: { v: 2 } }]);
  });
  it("only caches sets confirmed by the server and keeps old codes if registration fails", async () => {
    const records = [{ locator: "old", envelope: {} }];
    await setItem("recoveryRecords", records);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    await expect(registerRecoveryCodes([], "owner")).rejects.toThrow(/Could not save/);
    expect(await getItem("recoveryRecords")).toEqual(records);
    vi.mocked(fetch).mockResolvedValue(Response.json({ saved: true }));
    expect(await registerRecoveryCodes([], "owner")).toBe(true);
    expect(await getItem("recoveryRecords")).toEqual(records);
    const persist = db.setItem;
    vi.spyOn(db, "setItem").mockImplementation(async (key, value) => {
      if (key === "recoveryRecords") throw new Error("quota");
      await persist(key, value);
    });
    expect(await registerRecoveryCodes([], "owner")).toBe(false);
    expect(new Headers(vi.mocked(fetch).mock.lastCall![1]?.headers).get("X-Drip-Owner")).toBe("owner");
  });
});
