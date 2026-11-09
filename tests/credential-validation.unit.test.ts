import { expect, it } from "vitest";
import { loginTag, passwordError, unwrapPasswordRoot, validLoginTag, validPasswordWrap, wrapPasswordRoot } from "../lib/password-crypto";
import { decode, encode, validWrap, type PasskeyWrap } from "../lib/passkey-crypto";

const bytes = (length: number) => encode(new Uint8Array(length).fill(42));
const passwordWrap = { app: "drip-password", v: 1, username: "rampage_1", owner: "owner", iter: 600000, salt: bytes(16), iv: bytes(12), ct: bytes(32) };
const passkeyWrap: PasskeyWrap = { app: "drip-passkey-unlock", v: 1, vaultId: "vault", origin: "https://drip.example", rpId: "drip.example", credentialId: bytes(32), salt: bytes(32), iv: bytes(12), ct: bytes(32) };

it("normalises gamertags but preserves the allowed character and length boundaries", () => {
  expect(loginTag("  Rampage_1  ")).toBe("rampage_1");
  for (const tag of ["abc", "rampage_1", "a".repeat(16)]) expect(validLoginTag(tag)).toBe(true);
  for (const tag of ["ab", "a".repeat(17), "UPPER", "a-b", "a b", "a.b", "ééé"]) expect(validLoginTag(tag)).toBe(false);
});
it("accepts passwords by length without requiring character composition", () => {
  expect(passwordError("a".repeat(11))).toBeTruthy(); expect(passwordError("a".repeat(12))).toBeNull();
  expect(passwordError("x".repeat(256))).toBeNull(); expect(passwordError("x".repeat(257))).toBeTruthy();
  expect(passwordError("  a password with spaces  ")).toBeNull();
});
it("requires a supported password wrapper with bounded encoded fields", () => {
  expect(validPasswordWrap(passwordWrap)).toBe(true);
  for (const patch of [{ app: "other" }, { v: 2 }, { username: "Bad!" }, { owner: "" }, { owner: "x".repeat(128) }, { iter: 1 }, { salt: bytes(15) }, { iv: bytes(11) }, { ct: bytes(16) }, { ct: bytes(256) }, { salt: "%%%" }]) expect(validPasswordWrap({ ...passwordWrap, ...patch })).toBe(false);
  expect(validPasswordWrap(null)).toBe(false);
});
it("rejects bad wrapper or mismatched gamertag before attempting decryption", async () => {
  await expect(unwrapPasswordRoot(null, "rampage_1", "long password")).rejects.toThrow("Gamertag or password is incorrect.");
  await expect(unwrapPasswordRoot(passwordWrap, "someone_else", "long password")).rejects.toThrow("Gamertag or password is incorrect.");
});
it("rejects invalid password setup before any key derivation", async () => {
  await expect(wrapPasswordRoot("bad", "rampage_1", "short", "owner")).rejects.toThrow(/at least 12/);
  await expect(wrapPasswordRoot("bad", "rampage_1", "long enough password", "owner")).rejects.toThrow(/Invalid sign-in setup/);
});
it("round-trips binary passkey metadata with URL-safe encoding", () => {
  const input = Uint8Array.from([0, 1, 2, 251, 252, 253, 254, 255]); const text = encode(input);
  expect(text).not.toMatch(/[+/=]/); expect(decode(text)).toEqual(input);
});
it("binds passkey wrappers to their recorded origin, relying party and valid encrypted fields", () => {
  expect(validWrap(passkeyWrap, "https://drip.example", "drip.example")).toBe(true);
  expect(validWrap(passkeyWrap, "https://other.example", "drip.example")).toBe(false);
  expect(validWrap(passkeyWrap, "https://drip.example", "other.example")).toBe(false);
  for (const patch of [{ vaultId: "" }, { credentialId: "" }, { credentialId: "a".repeat(2049) }, { salt: bytes(31) }, { iv: bytes(11) }, { ct: bytes(16) }, { ct: bytes(256) }]) expect(validWrap({ ...passkeyWrap, ...patch }, passkeyWrap.origin, passkeyWrap.rpId)).toBe(false);
});
