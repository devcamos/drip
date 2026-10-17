import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import * as M from "../lib/maths";
import { saveDraft, loadDraft, clearDraft } from "../lib/draft";
import { rawStore } from "./storage-fixtures";
import type { Account } from "../lib/types";

const acct = (o: Partial<Account> = {}): Account => ({ id: "d", provider: "MoneyFarm", label: "", balance: 10000, ratePct: 3.65, rateType: "interest",
  frequency: "daily", nextPayoutDate: "2026-10-01", colour: "", payouts: [], events: [], createdAt: "2026-10-01T09:00:00Z", ...o });

describe("daily interest", () => {
  it("compounds daily into the balance and logs per-day interest", () => {
    const a = M.applyDailyAccrual(acct(), "2026-10-11");
    const d = 0.0365 / 365;
    expect(a.balance).toBe(M.round2(10000 * Math.pow(1 + d, 10)));
    expect(a.accruedThrough).toBe("2026-10-11");
    expect(a.events!.filter((e) => e.type === "interest")).toHaveLength(10);
    expect(a.events![0]).toEqual({ type: "interest", date: "2026-10-01", amount: 1 });
    // idempotent for the same day, continues next day
    expect(M.applyDailyAccrual(a, "2026-10-11")).toBe(a);
    expect(M.applyDailyAccrual(a, "2026-10-12").events).toHaveLength(11);
  });
  it("uses the rate in force each day, ignores non-daily accounts, handles new accounts", () => {
    const a = M.applyDailyAccrual(acct({ rateHistory: [{ from: "2026-10-01", ratePct: 3.65 }, { from: "2026-10-02", ratePct: 0 }] }), "2026-10-04");
    expect(a.events).toHaveLength(1);
    const m = acct({ frequency: "monthly" });
    expect(M.applyDailyAccrual(m, "2026-12-01")).toBe(m);
    const fresh = M.applyDailyAccrual(acct({ createdAt: "2026-10-15T10:00:00Z" }), "2026-10-15");
    expect(fresh.accruedThrough).toBe("2026-10-15");
    expect(M.applyDailyAccrual(acct({ createdAt: "" }), "2026-10-15").accruedThrough).toBe("2026-10-15");
    expect(M.applyDailyAccrual(acct({ balance: -5 }), "2026-10-03").balance).toBe(0);
  });
  it("daily accounts: per-day amount, no payout date, skipped from upcoming", () => {
    expect(M.payoutAmount(acct())).toBeCloseTo(1);
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
  it("saves, reloads (same code), updates handle, clears", async () => {
    expect(await loadDraft()).toBeNull();
    await saveDraft({ handle: "", code: "AAAA-BBBB" });
    await saveDraft({ handle: "devo", code: "AAAA-BBBB" });
    expect(await loadDraft()).toEqual({ handle: "devo", code: "AAAA-BBBB" });
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });
  it("returns null if the stored draft can't be decrypted", async () => {
    await saveDraft({ handle: "x", code: "c" });
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await clearDraft();
    await rawStore({ onboardingDraft: { handle: "x", key, iv: new Uint8Array(12), ct: new ArrayBuffer(20) } });
    expect(await loadDraft()).toBeNull();
    expect((await rawStore()).onboardingDraft).toBeUndefined();
  });
});
