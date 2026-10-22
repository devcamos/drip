import { expect, it } from "vitest";
import { emptyData, loadData, saveData } from "../lib/db";
import { round2 } from "../lib/maths";
import { rawStore, seedVault } from "./storage-fixtures";
import type { Account } from "../lib/types";
it("rejects overflowed financial values before replacing the encrypted copy, keeping the encrypted copy readable", async () => {
  const original = { ...emptyData(), lastBackupAt: "original" }; await seedVault(original);
  const before = await rawStore();
  const account: Account = { id: "synthetic", provider: "Moneybox", label: "", balance: round2(1e308), ratePct: 4, rateType: "interest", frequency: "monthly", nextPayoutDate: "2026-11-20", colour: "", payouts: [], createdAt: "2026-10-20" };
  expect(account.balance).toBe(Infinity);
  await expect(saveData({ ...original, accounts: [account] })).rejects.toThrow(/invalid amounts/);
  expect(await rawStore()).toEqual(before); expect(await loadData()).toEqual(original);
});
