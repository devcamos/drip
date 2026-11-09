import { expect, it } from "vitest";
import { MAX_RECOVERY_FILE_BYTES, parseRecoveryCodesFile, RecoveryFileError } from "../lib/recovery-file";
import { AccountSwitchRequired } from "../lib/account-switch";

const code = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF";
it("reads original and alternate codes without including a gamertag", () => {
  const alternate = `DRIP2-${code}`;
  expect(parseRecoveryCodesFile(`Gamertag: example\n1. ${code}\n2. ${alternate}`)).toEqual([code, alternate]);
});
it("deduplicates case-insensitive repeated codes", () => {
  expect(parseRecoveryCodesFile(`${code.toLowerCase()}\n${code}`)).toEqual([code]);
});
it("rejects unrelated or malformed content without echoing it in the error", () => {
  for (const input of ["", "private personal note", "OOOO-OOOO-OOOO-OOOO-OOOO-OOOO"]) {
    try { parseRecoveryCodesFile(input); throw new Error("Expected failure"); }
    catch (error) { expect(error).toBeInstanceOf(RecoveryFileError); expect((error as Error).message).not.toContain("private personal note"); }
  }
});
it("enforces the byte limit before parsing multibyte content", () => {
  expect(() => parseRecoveryCodesFile("x".repeat(MAX_RECOVERY_FILE_BYTES + 1))).toThrow(/32 KB/);
  expect(() => parseRecoveryCodesFile("🫧".repeat(9000))).toThrow(/32 KB/);
});
it("rejects more than six distinct valid codes", () => {
  const codes = ["AAAA", "BBBB", "CCCC", "DDDD", "EEEE", "FFFF", "GGGG"].map(part => `${part}-BBBB-CCCC-DDDD-EEEE-FFFF`);
  expect(() => parseRecoveryCodesFile(codes.join("\n"))).toThrow(/No supported/);
});
it("keeps account-switch confirmation bound to the retained copy", () => {
  const retained = { vaultId: "vault", generation: "generation", records: "bound-records" };
  const error = new AccountSwitchRequired(retained, false);
  expect(error.name).toBe("AccountSwitchRequired"); expect(error.retained).toBe(retained); expect(error.canReplace).toBe(false);
});
