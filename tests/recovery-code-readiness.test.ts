import { beforeEach, expect, it, vi } from "vitest";
import * as db from "../lib/db";
import { confirmRecoveryCodesSaved, recoveryReadiness } from "../lib/recovery-readiness";
import { registerRecoveryCodes } from "../lib/recovery-codes";
import { seedVault } from "./storage-fixtures";

beforeEach(async () => {
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ saved: true })));
  await seedVault();
  await confirmRecoveryCodesSaved((await db.passkeyUnlockContext()).binding.vaultId);
  vi.mocked(window.dispatchEvent).mockClear();
});

it("invalidates the old saved-file receipt before replacing codes and requires a fresh confirmation", async () => {
  expect((await recoveryReadiness()).codesSaved).toBe(true);
  vi.mocked(fetch).mockImplementationOnce(async () => {
    expect((await recoveryReadiness()).codesSaved).toBe(false);
    return Response.json({ saved: true });
  });
  await registerRecoveryCodes([], "owner");
  expect((await recoveryReadiness()).codesSaved).toBe(false);
  expect(window.dispatchEvent).toHaveBeenCalledOnce();
  expect(window.dispatchEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: "drip-recovery-changed" }));
  await confirmRecoveryCodesSaved((await db.passkeyUnlockContext()).binding.vaultId);
  expect((await recoveryReadiness()).codesSaved).toBe(true);
});

it("keeps readiness unconfirmed when the server rotates codes but local wrapper caching fails", async () => {
  const persist = db.setItem;
  vi.spyOn(db, "setItem").mockImplementation(async (key, value) => {
    if (key === "recoveryRecords") throw new Error("Synthetic cache quota");
    await persist(key, value);
  });
  expect(await registerRecoveryCodes([], "owner")).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
  expect((await recoveryReadiness()).codesSaved).toBe(false);
});

it("does not send a replacement when the old receipt cannot be invalidated locally", async () => {
  vi.spyOn(db, "setItem").mockRejectedValueOnce(new Error("Synthetic storage outage"));
  await expect(registerRecoveryCodes([], "owner")).rejects.toThrow(/existing codes have not changed/i);
  expect(fetch).not.toHaveBeenCalled();
  expect((await recoveryReadiness()).codesSaved).toBe(true);
});

it("does not claim the old file is current after a request with an unknown server outcome", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic connection loss"));
  await expect(registerRecoveryCodes([], "owner")).rejects.toThrow(/connection loss/);
  expect((await recoveryReadiness()).codesSaved).toBe(false);
});
