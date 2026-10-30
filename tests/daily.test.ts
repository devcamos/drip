import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";
import { saveDraft, loadDraft, clearDraft } from "../lib/draft";
import { rawStore } from "./storage-fixtures";
import type { Account } from "../lib/types";

const acct = (o: Partial<Account> = {}): Account => ({ id: "d", provider: "MoneyFarm", label: "", balance: 1_000_000, currency: "GBP", ratePct: 3.65, rateType: "interest",
  frequency: "daily", nextPayoutDate: "2026-10-01", colour: "", payouts: [], events: [], createdAt: "2026-10-01T09:00:00Z", ...o });

describe("daily interest", () => {
  it("predicts daily income without crediting the saved balance or creating payments", () => {
    const a = acct();
    expect(M.payoutAmount(a)).toBeCloseTo(100);
    expect(M.projection([a], 12).at(-1)!.income).toBeGreaterThan(36500);
    expect(a.balance).toBe(1_000_000);
    expect(a.events).toEqual([]);
    expect(a.payouts).toEqual([]);
    expect(M.recordedIncome([a])).toBe(0);
  });
  it("daily accounts: per-day amount, no payout date, skipped from upcoming", () => {
    expect(M.payoutAmount(acct())).toBeCloseTo(100);
    expect(M.nextPayout("2020-01-01", "daily", "2026-10-15")).toBe("2026-10-15");
    expect(M.upcoming([acct(), acct({ id: "m", frequency: "monthly", nextPayoutDate: "2026-10-20" })], "2026-10-15").map((u) => u.account.id)).toEqual(["m"]);
  });
  it("groups interest history by week and month", () => {
    expect(M.weekStart("2026-10-15")).toBe("2026-10-12"); // Thursday -> Monday
    expect(M.weekStart("2026-10-12")).toBe("2026-10-12");
    expect(M.weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
    const evs = [{ type: "interest" as const, date: "2026-09-30", amount: 1 }, { type: "interest" as const, date: "2026-10-01", amount: 2 },
      { type: "interest" as const, date: "2026-10-05", amount: 3 }, { type: "topup" as const, date: "2026-10-05", amount: 500 }];
    expect(M.interestHistory(evs, "week")).toEqual([{ period: "2026-10-05", amount: 3 }, { period: "2026-09-28", amount: 3 }]);
    expect(M.interestHistory(evs, "month")).toEqual([{ period: "2026-10", amount: 5 }, { period: "2026-09", amount: 1 }]);
    expect(M.interestHistory(undefined, "month")).toEqual([]);
  });
  it("interest events don't count as deposits or withdrawals", () => {
    expect(M.depositsInMonth([{ events: [{ type: "interest", date: "2026-10-01", amount: 5 }] }], "2026-10")).toBe(0);
  });
});

describe("onboarding draft", () => {
  it("saves the unsent name in memory, updates it and clears", async () => {
    expect(await loadDraft()).toBeNull();
    await saveDraft({ handle: "" });
    await saveDraft({ handle: "devo" });
    expect(await loadDraft()).toEqual({ handle: "devo" });
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });
  it("returns null if the stored draft can't be decrypted", async () => {
    await saveDraft({ handle: "x" });
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await clearDraft();
    await rawStore({ onboardingDraft: { handle: "x", key, iv: new Uint8Array(12), ct: new ArrayBuffer(20) } });
    expect(await loadDraft()).toBeNull();
    expect((await rawStore()).onboardingDraft).toBeUndefined();
  });
});
