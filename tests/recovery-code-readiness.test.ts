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

it.each(["retry", "different-set", "unknown-outcome"])("keeps the original saved-file confirmation on %s", async outcome => {
  if (outcome === "different-set") vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: "RECOVERY_CODES_EXIST" }, { status: 409 }));
  if (outcome === "unknown-outcome") vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic connection loss"));
  if (outcome === "retry") await registerRecoveryCodes([], "owner");
  else await expect(registerRecoveryCodes([], "owner")).rejects.toThrow();
  expect((await recoveryReadiness()).codesSaved).toBe(true);
  expect(window.dispatchEvent).not.toHaveBeenCalled();
});

it("preserves the original confirmation when only local wrapper caching fails", async () => {
  vi.spyOn(db, "setItem").mockRejectedValueOnce(new Error("Synthetic cache quota"));
  expect(await registerRecoveryCodes([], "owner")).toBe(false);
  expect((await recoveryReadiness()).codesSaved).toBe(true);
});
