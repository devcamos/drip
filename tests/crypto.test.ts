import { describe, it, expect } from "vitest";
import * as C from "../lib/crypto";

const IT = 100_000; // minimum allowed; keeps tests fast

describe("recovery code", () => {
  it("generates valid, unique 24-char codes", () => {
    const a = C.generateRecoveryCode(), b = C.generateRecoveryCode();
    expect(a).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(a).not.toBe(b);
    expect(C.isValidCode(a)).toBe(true);
    expect(C.isValidCode(a.toLowerCase().replace(/-/g, " "))).toBe(true);
    expect(C.isValidCode("ABCD")).toBe(false);
    expect(C.isValidCode("0000-0000-0000-0000-0000-0000")).toBe(false);
  });
  it("verifier accepts the right code only", async () => {
    const code = C.generateRecoveryCode();
    const v = await C.codeVerifier(code);
    expect(await C.checkCode(code.toLowerCase(), v)).toBe(true);
    expect(await C.checkCode(C.generateRecoveryCode(), v)).toBe(false);
  });
});

describe("backup round-trip", () => {
  const data = { version: 1, accounts: [{ id: "1", provider: "Zopa", label: "Rainy day £", balance: 3000, ratePct: 7 }], snapshots: [] };
  it("encrypts and decrypts with the recovery code", async () => {
    const code = C.generateRecoveryCode();
    const f = await C.encryptBackup(data, code, IT);
    expect(f.ct).not.toContain("Zopa");
    expect(JSON.stringify(f)).not.toContain("Rainy");
    expect(await C.decryptBackup(f, code.replace(/-/g, "").toLowerCase())).toEqual(data);
  });
  it("defaults to 600k iterations and random salt/iv", async () => {
    const code = C.generateRecoveryCode();
    const [a, b] = await Promise.all([C.encryptBackup(data, code), C.encryptBackup(data, code)]);
    expect(a.iter).toBe(600_000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });
  it("rejects wrong code, tampering, foreign and weak files", async () => {
    const code = C.generateRecoveryCode();
    const f = await C.encryptBackup(data, code, IT);
    await expect(C.decryptBackup(f, C.generateRecoveryCode())).rejects.toThrow(/Wrong recovery code/);
    const ct = atob(f.ct).split(""); ct[0] = String.fromCharCode(ct[0].charCodeAt(0) ^ 1);
    await expect(C.decryptBackup({ ...f, ct: btoa(ct.join("")) }, code)).rejects.toBeInstanceOf(C.BackupError);
    await expect(C.decryptBackup({ foo: 1 }, code)).rejects.toThrow(/isn't a Drip backup/);
    await expect(C.decryptBackup(null, code)).rejects.toThrow(/isn't a Drip backup/);
    await expect(C.decryptBackup({ ...f, iter: 1000 }, code)).rejects.toThrow(/unsafe/);
  });
});
