import { it, expect } from "vitest";
import { createVault, openVault, decryptLocal, type VaultHeader } from "../lib/local-vault";
import { encryptBackup } from "../lib/crypto";
import { fixtureCode as code } from "./storage-fixtures";
it("rejects unsupported vault formats and malformed wrapped keys rather than using unsafe fallback keys", async () => {
  await expect(createVault("short")).rejects.toThrow(/complete recovery/);
  const keys = await createVault(code);
  await expect(openVault({ ...keys.header, v: 2 } as unknown as VaultHeader, code)).rejects.toThrow(/Unsupported local vault/);
  const badPurpose = { ...keys.header, wrappedKey: await encryptBackup({ purpose: "different-format", id: keys.header.id, key: "AA==" }, code) };
  await expect(openVault(badPurpose, code)).rejects.toThrow(/Invalid local key/);
  const shortKey = { ...keys.header, wrappedKey: await encryptBackup({ purpose: "drip-local-key-v1", id: keys.header.id, key: "AA==" }, code) };
  await expect(openVault(shortKey, code)).rejects.toThrow(/Invalid local key/);
  await expect(decryptLocal({ app: "wrong" } as any, keys)).rejects.toThrow(/Invalid encrypted local data/);
  expect(keys.dataKey.extractable).toBe(false); expect(keys.cloudKey.extractable).toBe(false);
});
