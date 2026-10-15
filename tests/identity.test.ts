import { describe, it, expect } from "vitest";
import * as I from "../lib/identity";
import * as C from "../lib/crypto";
import { isAppData, emptyData } from "../lib/db";

describe("gamertag", () => {
  it("validates handles", () => {
    expect(I.handleError("devo")).toBeNull();
    expect(I.handleError("a_1")).toBeNull();
    expect(I.handleError("x".repeat(16))).toBeNull();
    expect(I.handleError("ab")).toMatch(/at least 3/);
    expect(I.handleError("x".repeat(17))).toMatch(/16/);
    expect(I.handleError("dev o")).toMatch(/letters/);
    expect(I.handleError("dévo")).toMatch(/letters/);
    expect(I.handleError("me@x.com")).toMatch(/letters/);
  });
  it("reserved suffix generator (for sync) gives 4 digits", () => {
    const s = new Set(Array.from({ length: 200 }, () => I.randomSuffix()));
    for (const x of s) expect(x).toMatch(/^\d{4}$/);
    expect(s.size).toBeGreaterThan(150);
  });
  it("creates identity from the typed handle with no suffix", () => {
    const a = I.newIdentity("devo", new Date("2026-10-15T18:00:00Z"));
    expect(a.suffix).toBeUndefined();
    expect(I.formatTag(a)).toBe("devo");
    const b = I.withSuffix(a, "4821");
    expect(I.formatTag(b)).toBe("devo#4821");
    expect(I.isIdentity(b)).toBe(true);
    expect(() => I.withSuffix(a, "12345")).toThrow();
    expect(() => I.withSuffix(a, "ab")).toThrow();
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.createdAt).toBe("2026-10-15T18:00:00.000Z");
    expect(I.newIdentity("devo").id).not.toBe(a.id);
    expect(I.isIdentity(a)).toBe(true);
    expect(I.isIdentity({ ...a, handle: "x" })).toBe(false);
    expect(I.isIdentity(null)).toBe(false);
    expect(() => I.newIdentity("x")).toThrow();
  });
  it("id bytes for WebAuthn", () => {
    const b = I.idBytes("00112233-4455-6677-8899-aabbccddeeff");
    expect(b).toHaveLength(16);
    expect(b[0]).toBe(0x00); expect(b[15]).toBe(0xff);
    expect(() => I.idBytes("nope")).toThrow();
  });
  it("identity survives the encrypted backup round-trip and is validated", async () => {
    const identity = I.newIdentity("devo");
    const data = { ...emptyData(), identity };
    const code = C.generateRecoveryCode();
    const f = await C.encryptBackup(data, code, 100_000);
    expect(JSON.stringify(f)).not.toContain("devo");
    const back = await C.decryptBackup(f, code);
    expect(back).toEqual(data);
    expect(isAppData(back)).toBe(true);
    expect(isAppData({ ...data, identity: { ...identity, suffix: "abc" } })).toBe(false);
  });
});
