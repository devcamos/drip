import { expect, it } from "vitest";
import { generateRecoveryCode } from "../lib/crypto";
import { parseRecoveryCodesFile } from "../lib/recovery-file";

it("imports the six numbered codes from the actual downloadable format, without treating a gamertag as a code", () => {
  const codes = Array.from({ length: 6 }, () => `DRIP2-${generateRecoveryCode()}`);
  const text = `Drip recovery codes\nGamertag: tester\n${codes.map((code, index) => `${index + 1}. ${code}`).join("\n")}\nKeep private.`;
  expect(parseRecoveryCodesFile(text)).toEqual(codes);
  expect(parseRecoveryCodesFile(`${codes[0].toLowerCase()}\n${codes[0]}`)).toEqual([codes[0]]);
  expect(parseRecoveryCodesFile(generateRecoveryCode())).toHaveLength(1);
});
it("rejects oversized files, invalid codes, empty input and excessive code lists", () => {
  for (const value of ["", "Gamertag: tester", "OOOO-OOOO-OOOO-OOOO-OOOO-OOOO", Array.from({ length: 7 }, generateRecoveryCode).join("\n")]) {
    expect(() => parseRecoveryCodesFile(value)).toThrow(/No supported/);
  }
  expect(() => parseRecoveryCodesFile("🫧".repeat(9000))).toThrow(/32 KB/);
});
