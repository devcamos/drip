import type { Account, BalanceEvent, Payout } from "../lib/types";
import { toPence } from "../lib/money";

/** Convert a pound amount to integer pence for fixtures. */
export const pence = (pounds: number) => toPence(pounds);

export const event = (e: Omit<BalanceEvent, "id"> & { id?: string }): BalanceEvent => ({ id: e.id ?? "evt-" + e.type + e.date + e.amount, ...e });
export const payout = (p: Omit<Payout, "id"> & { id?: string }): Payout => ({ id: p.id ?? "pay-" + p.date + p.amount + p.kind, ...p });

/** Canonical migrated account fixture (integer pence + GBP). */
export function baseAccount(o: Partial<Account> = {}): Account {
  return {
    id: "a1",
    provider: "Zopa",
    label: "",
    balance: pence(3000),
    currency: "GBP",
    ratePct: 7,
    rateType: "interest",
    frequency: "monthly",
    nextPayoutDate: "2026-10-28",
    colour: "#2b2d86",
    payouts: [],
    events: [],
    createdAt: "2026-01-01T00:00:00Z",
    rateHistory: [{ from: "2026-01-01", ratePct: 7 }],
    ...o,
  };
}
