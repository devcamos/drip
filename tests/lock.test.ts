import { describe, it, expect, vi } from "vitest";
import * as L from "../lib/lock";

describe("lock timing", () => {
  it("locks on open and after 5 minutes hidden, only when enabled", () => {
    expect(L.shouldLock(false, 0, 1e9, true)).toBe(false);
    expect(L.shouldLock(true, null, 0, true)).toBe(true);
    expect(L.shouldLock(true, null, 1e9, false)).toBe(false);
    expect(L.shouldLock(true, 0, L.LOCK_AFTER_MS - 1, false)).toBe(false);
    expect(L.shouldLock(true, 0, L.LOCK_AFTER_MS, false)).toBe(true);
  });
});

describe("passkey", () => {
  const raw = new Uint8Array([251, 255, 1, 2, 3]).buffer; // exercises base64url - and _
  it("support detection", async () => {
    expect(await L.passkeySupported(undefined)).toBe(false);
    expect(await L.passkeySupported({ isUserVerifyingPlatformAuthenticatorAvailable: async () => true })).toBe(true);
    expect(await L.passkeySupported({ isUserVerifyingPlatformAuthenticatorAvailable: async () => { throw new Error(); } })).toBe(false);
  });
  it("registers with a platform authenticator and verifies the same credential", async () => {
    const create = vi.fn(async () => ({ rawId: raw }));
    const id = await L.registerPasskey({ create, get: vi.fn() } as any, "localhost");
    const opts = (create.mock.calls[0] as any)[0].publicKey;
    expect(opts.authenticatorSelection.authenticatorAttachment).toBe("platform");
    expect(opts.authenticatorSelection.userVerification).toBe("required");
    expect(id).not.toMatch(/[+/=]/);
    const get = vi.fn(async () => ({ rawId: raw }));
    expect(await L.verifyPasskey({ create, get } as any, id, "localhost")).toBe(true);
    expect(new Uint8Array((get.mock.calls[0] as any)[0].publicKey.allowCredentials[0].id)).toEqual(new Uint8Array(raw));
  });
  it("fails closed", async () => {
    await expect(L.registerPasskey({ create: async () => null, get: vi.fn() } as any, "x")).rejects.toThrow();
    expect(await L.verifyPasskey({ create: vi.fn(), get: async () => null } as any, "AQID", "x")).toBe(false);
    expect(await L.verifyPasskey({ create: vi.fn(), get: async () => ({ rawId: new Uint8Array([9]).buffer }) } as any, "AQID", "x")).toBe(false);
    expect(await L.verifyPasskey({ create: vi.fn(), get: async () => { throw new Error("NotAllowed"); } } as any, "AQID", "x")).toBe(false);
  });
});
