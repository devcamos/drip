import type { Account } from "../lib/types";

// Static synthetic data only: no I/O, real time or random keys.
export const calendarAccount = (overrides: Partial<Account> = {}): Account => ({
  id: "holding", provider: "Trading212", productCategory: "stocks-funds",
  holdingName: "Realty Income", label: "", balance: 1200, ratePct: 5,
  rateType: "dividend", frequency: "monthly", nextPayoutDate: "2026-11-15",
  createdAt: "2026-01-01T12:00:00Z", colour: "#176b9a", payouts: [], events: [],
  ...overrides,
});
