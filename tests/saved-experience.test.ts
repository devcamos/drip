import { beforeEach, expect, test, vi } from "vitest";
import { accountAssets, creditCardDraft, creditCardWarnings, isCreditAccount, portfolioTotals, validCreditCardTerms, validateCreditCardDraft } from "../lib/credit-card";
import { applyMarketValuation, applyValuationTransfer, clearMarketValuation, hasValuationTransfers, incomeBalance, validMarketValuation } from "../lib/market-valuation";
import { validProductFields } from "../lib/products";
import { cloudPayload } from "../lib/cloud-payload";
import { dataFormatVersion } from "../lib/data-format";
import { paymentReminders, reminderSchedule } from "../lib/payment-reminders";
import * as M from "../lib/maths";
import { releaseData, releaseDebt, releaseHoldingsAndDebts, releaseSaver, releaseStock } from "./saved-experience-fixtures";
import { groupAccounts } from "../app/accounts/presentation";
import { investmentInputs, parseInvestment } from "../lib/stock-investment";

test("existing tiny share holdings remain editable without changing their saved values", () => {
  const holding = { shares: 0.00000001, averagePriceGBP: 0.00000002, originalPrice: { currency: "USD" as const, averagePrice: 0.00000003 } };
  const input = investmentInputs(holding);
  expect(input.shares).toBe("0.00000001");
  expect(input.averagePriceGBP).toBe("0.00000002");
  expect(input.originalPrice).toBe("0.00000003");
  expect(parseInvestment(input)).toEqual(holding);
});

test("groups recorded cash, investments, debt and unclassified products without mixing balances", () => {
  const accounts = [releaseSaver({ balance: 0.1 }), releaseSaver({ id: "cash-2", balance: 0.2 }), releaseStock(), releaseDebt(), releaseSaver({ id: "other", productCategory: "other", balance: 5 })];
  const before = structuredClone(accounts);
  expect(groupAccounts(accounts).map(group => [group.label, group.accounts.length, group.total])).toEqual([
    ["Cash", 2, 0.3], ["Investments", 1, 2500], ["Debt", 1, 1200], ["Other", 1, 5],
  ]);
  expect(accounts).toEqual(before);
  expect(groupAccounts([releaseStock({ productCategory: undefined })])[0].label).toBe("Investments");
  expect(groupAccounts([])).toEqual([]);
});

const at = Date.parse("2026-11-07T12:00:00Z");
// Transfer fixtures include actual entries through8Nov; the quote clock remains explicit.
beforeEach(() => vi.setSystemTime(new Date("2026-11-08T12:00:00Z")));
const price = { priceUSD: 100, fxRate: 0.75, fxDate: "2026-11-06" };
const complete = () => ({ balance: "1200.25", apr: "24.9", minimumPayment: "35.25", plannedPayment: "75", paymentDate: "2026-11-20" });

test("statement drafts round-trip provider figures without changing their source record", () => {
  const account = releaseDebt({ balance: 1200.25, creditCard: { apr: 24.9, minimumPayment: 35.25, plannedPayment: 75 } });
  const before = structuredClone(account);
  expect(creditCardDraft(account)).toEqual(complete());
  expect(validateCreditCardDraft(creditCardDraft(account))).toEqual({ value: { balance: 1200.25, creditCard: account.creditCard, nextPayoutDate: "2026-11-20" }, errors: {} });
  expect(account).toEqual(before);
});

test("an unset planned payment stays distinct from an explicitly recorded zero", () => {
  const blank = validateCreditCardDraft({ ...complete(), plannedPayment: " " }).value!;
  const zero = validateCreditCardDraft({ ...complete(), plannedPayment: "0" }).value!;
  expect(blank.creditCard).not.toHaveProperty("plannedPayment");
  expect(zero.creditCard.plannedPayment).toBe(0);
  expect(creditCardDraft(releaseDebt({ creditCard: { apr: 0, minimumPayment: 0 } })).plannedPayment).toBe("");
});

test("zero debt, minimum and APR are valid statement values", () => {
  expect(validateCreditCardDraft({ ...complete(), balance: "0", minimumPayment: "0", apr: "0" }).value).toMatchObject({ balance: 0, creditCard: { apr: 0, minimumPayment: 0 } });
});

test("required statement amounts and APR cannot silently become zero", () => {
  for (const field of ["balance", "minimumPayment", "apr"] as const) {
    const result = validateCreditCardDraft({ ...complete(), [field]: " " });
    expect(result.value).toBeUndefined();
    expect(result.errors[field]).toBeTruthy();
  }
});

test("negative, currency-formatted and ambiguous textual amounts are rejected", () => {
  for (const value of ["-1", "£50", "1,000", "1e2", "0x10", "NaN", "Infinity"]) {
    for (const field of ["balance", "minimumPayment", "plannedPayment"] as const) expect(validateCreditCardDraft({ ...complete(), [field]: value }).errors[field]).toBeTruthy();
  }
});

test("statement money respects penny precision and the supported amount bound", () => {
  expect(validateCreditCardDraft({ ...complete(), balance: "1000000000000" }).value?.balance).toBe(1e12);
  expect(validateCreditCardDraft({ ...complete(), balance: ".25" }).value?.balance).toBe(0.25);
  for (const value of ["1.001", "1000000000000.01", "9".repeat(31)]) expect(validateCreditCardDraft({ ...complete(), balance: value }).errors.balance).toBeTruthy();
});

test("APR uses finite provider values rather than a savings-rate percentage cap", () => {
  expect(validateCreditCardDraft({ ...complete(), apr: "125.55" }).value?.creditCard.apr).toBe(125.55);
  for (const value of ["-1", "NaN", "Infinity", "1e2", String(Number.MAX_SAFE_INTEGER + 1)]) expect(validateCreditCardDraft({ ...complete(), apr: value }).errors.apr).toBeTruthy();
});

test("statement due dates accept valid leap days and already recorded past dates", () => {
  for (const date of ["2024-02-29", "2026-01-01", "2026-11-20"]) expect(validateCreditCardDraft({ ...complete(), paymentDate: date }).value?.nextPayoutDate).toBe(date);
});

test("impossible calendar days and non-date strings cannot enter a debt record", () => {
  for (const date of ["", "2026-02-29", "2026-04-31", "2026-13-01", "2026-11-20T00:00:00Z", "20/11/2026"]) expect(validateCreditCardDraft({ ...complete(), paymentDate: date }).errors.paymentDate).toBeTruthy();
});

test("invalid draft shapes and unexpected fields do not become saved statement data", () => {
  for (const value of [null, undefined, [], "1200", { ...complete(), ownerId: "private-owner" }]) expect(validateCreditCardDraft(value).value).toBeUndefined();
  expect(creditCardDraft()).toEqual({ balance: "", apr: "", minimumPayment: "", plannedPayment: "", paymentDate: "" });
});

test("persisted credit terms validate numeric types and optional payment independently", () => {
  expect(validCreditCardTerms({ apr: 0, minimumPayment: 0 })).toBe(true);
  expect(validCreditCardTerms({ apr: 24.9, minimumPayment: 20, plannedPayment: 0 })).toBe(true);
  for (const value of [[], null, { apr: "24.9", minimumPayment: 20 }, { apr: -1, minimumPayment: 20 }, { apr: 1, minimumPayment: -1 }, { apr: 1, minimumPayment: 20, plannedPayment: Infinity }]) expect(validCreditCardTerms(value)).toBe(false);
});

test("debt records use one due date and a zero income rate regardless of their APR", () => {
  const account = releaseDebt();
  expect(validProductFields(account)).toBe(true);
  expect(account.ratePct).toBe(0);
  for (const changed of [{ ratePct: 24.9 }, { frequency: "daily" as const }, { nextPayoutDate: "2026-02-31" }, { provider: " " }, { creditCard: undefined }]) expect(validProductFields({ ...account, ...changed })).toBe(false);
});

test("asset-only income fields cannot be attached to debt and credit terms cannot shadow an asset", () => {
  for (const changed of [{ investment: { shares: 1, averagePriceGBP: 1 } }, { bonus: { amount: 5, expectedDate: "2026-11-20" } }, { payouts: [{ amount: 10, date: "2026-11-20", kind: "actual" as const }] }, { reinvestIncome: true }, { holdingName: "Realty Income" }]) expect(validProductFields(releaseDebt(changed))).toBe(false);
  expect(validProductFields(releaseSaver({ creditCard: { apr: 0, minimumPayment: 0 } }))).toBe(false);
});

test("payment-plan mismatch notes preserve the exact figures rather than clamping them", () => {
  const under = releaseDebt({ creditCard: { apr: 0, minimumPayment: 50, plannedPayment: 25 } });
  expect(creditCardWarnings(under).join(" ")).toMatch(/below.*minimum/);
  const over = releaseDebt({ balance: 10 }); const before = structuredClone(over);
  expect(creditCardWarnings(over)).toHaveLength(2);
  expect(over).toEqual(before);
  expect(creditCardWarnings(releaseSaver())).toEqual([]);
});

test("every stock and credit card contributes once to separate asset, debt and income totals", () => {
  expect(portfolioTotals(releaseHoldingsAndDebts())).toEqual({ money: 9500, debt: 1800, netPosition: 7700, annualIncome: 404, monthlyIncome: 33.67 });
});

test("portfolio totals use pennies and retain an honest negative net position", () => {
  const accounts = [releaseSaver({ balance: 0.1, ratePct: 0 }), releaseSaver({ id: "cash2", balance: 0.2, ratePct: 0 }), releaseDebt({ balance: 0.4 })];
  expect(portfolioTotals(accounts)).toMatchObject({ money: 0.3, debt: 0.4, netPosition: -0.1 });
  expect(portfolioTotals([])).toEqual({ money: 0, debt: 0, netPosition: 0, annualIncome: 0, monthlyIncome: 0 });
});

test("asset filtering is immutable and never groups distinct holdings by provider", () => {
  const accounts = releaseHoldingsAndDebts(), before = structuredClone(accounts);
  expect(accountAssets(accounts).map(account => account.id)).toEqual(["cash", "stock", "stock-2"]);
  expect(accounts).toEqual(before);
  expect(isCreditAccount(releaseStock())).toBe(false);
  expect(isCreditAccount(releaseDebt())).toBe(true);
});

test("debt does not generate interest, received income, projections or incoming payment reminders", () => {
  const debt = releaseDebt(), asset = releaseSaver();
  expect(M.payoutAmount(debt)).toBe(0);
  expect(M.totalMonthlyIncome([debt])).toBe(0);
  expect(M.recordedIncome([debt])).toBe(0);
  expect(M.projection([asset, debt], 3, 0, "2026-11-07")).toEqual(M.projection([asset], 3, 0, "2026-11-07"));
  expect(paymentReminders([debt], "2026-11-20")).toEqual([]);
  expect(reminderSchedule([debt], "2026-11-20", "Europe/London").plans).toEqual([{ anchor: "2026-11-20", frequency: "monthly", once: true }]);
});

test("historical asset snapshots retain their meaning when credit cards are added", () => {
  const assets = [releaseSaver(), releaseStock()];
  const withDebt = M.upsertSnapshot([], [...assets, releaseDebt()], new Date(at));
  expect(withDebt).toEqual(M.upsertSnapshot([], assets, new Date(at)));
  expect(withDebt[0].totalBalance).toBe(7500);
});

test("financial formats stay legacy-compatible until debt or a valuation requires version three", () => {
  expect(dataFormatVersion(releaseData([releaseSaver()]))).toBe(1);
  expect(dataFormatVersion(releaseData([releaseStock()]))).toBe(2);
  expect(dataFormatVersion(releaseData([releaseDebt()]))).toBe(3);
  expect(dataFormatVersion(releaseData([applyMarketValuation(releaseStock(), price, at)]))).toBe(3);
  for (const value of [null, undefined, "original recovery wrapper", {}, { purpose: "drip-recovery-root-v1", root: "synthetic" }]) expect(dataFormatVersion(value)).toBe(1);
});

test("cloud portability deliberately retains financial terms and strips private device fields", () => {
  const credit = releaseDebt({ label: "private nickname" });
  const stock = applyMarketValuation(releaseStock({ label: "another private nickname" }), price, at);
  const value = cloudPayload(releaseData([credit, stock]));
  expect(value.accounts[0].creditCard).toEqual(credit.creditCard);
  expect(value.accounts[1].marketValuation).toEqual(stock.marketValuation);
  expect(JSON.stringify(value)).not.toMatch(/private nickname|another private/);
  expect(value.accounts[0]).not.toHaveProperty("label");
});

test("an explicit USD price changes holding value while keeping cost, shares and annual dividend assumptions", () => {
  const source = releaseStock(), before = structuredClone(source);
  const updated = applyMarketValuation(source, price, at);
  expect(updated.balance).toBe(3750);
  expect(incomeBalance(updated)).toBe(2500);
  expect(portfolioTotals([updated]).annualIncome).toBe(135);
  expect(updated.investment).toEqual(source.investment);
  expect(updated.payouts).toEqual(source.payouts);
  expect(source).toEqual(before);
});

test("successive prices preserve the first recorded basis and can restore that exact baseline", () => {
  const first = applyMarketValuation(releaseStock(), price, at);
  const second = applyMarketValuation(first, { ...price, priceUSD: 80 }, at);
  expect(second.balance).toBe(3000);
  expect(second.marketValuation?.recordedBalance).toBe(2500);
  const restored = clearMarketValuation(second, at);
  expect(restored.balance).toBe(2500);
  expect(restored.marketValuation).toBeUndefined();
  expect(clearMarketValuation(restored, at)).toBe(restored);
});

test("transfers adjust a valued holding's recorded income basis while preserving its quote and shares", () => {
  const valued = applyMarketValuation(releaseStock(), price, at);
  const withdrawn = M.applyWithdraw(valued, 100, "2026-11-07");
  expect(withdrawn.balance).toBe(3650);
  expect(withdrawn.marketValuation?.recordedBalance).toBe(2400);
  expect(withdrawn.marketValuation).toMatchObject({ priceUSD: 100, fxRate: 0.75, fxDate: "2026-11-06" });
  expect(withdrawn.investment).toEqual(valued.investment);
  expect(portfolioTotals([withdrawn]).annualIncome).toBe(129.6);
  expect(hasValuationTransfers(withdrawn)).toBe(true);
  const topped = M.applyTopUp(withdrawn, 50, "2026-11-08");
  expect(topped.balance).toBe(3700);
  expect(topped.marketValuation?.recordedBalance).toBe(2450);
  expect(topped.marketValuation?.priceUSD).toBe(100);
  expect(portfolioTotals([topped]).annualIncome).toBe(132.3);
  expect(validMarketValuation(topped.marketValuation, topped)).toBe(true);
  const withoutHistory = M.applyTopUp({ ...valued, events: [] }, 50, "2026-11-07");
  expect(validMarketValuation(withoutHistory.marketValuation, withoutHistory)).toBe(true);
  expect(withoutHistory.events).toHaveLength(2);
  for (const changed of [M.applyTopUp(valued, 1.005, "2026-11-07"), M.applyWithdraw(valued, 1.005, "2026-11-07")]) {
    expect(validMarketValuation(changed.marketValuation, changed)).toBe(true);
    expect(changed.events!.at(-1)!.amount).toBe(1.01);
  }
});

test("withdrawing an entire valued holding clears income and cannot restore a phantom recorded balance", () => {
  for (const priceUSD of [40, 100]) {
    const valued = applyMarketValuation(releaseStock(), { ...price, priceUSD }, at);
    const emptied = M.applyWithdraw(valued, valued.balance, "2026-11-07");
    expect(emptied.balance).toBe(0);
    expect(emptied.marketValuation?.recordedBalance).toBe(0);
    expect(portfolioTotals([emptied]).annualIncome).toBe(0);
    expect(validMarketValuation(emptied.marketValuation, emptied)).toBe(true);
    expect(clearMarketValuation(emptied, at).balance).toBe(0);
    const laterDeposit = M.applyTopUp(emptied, 50, "2026-11-08");
    expect(incomeBalance(laterDeposit)).toBe(50);
    expect(portfolioTotals([laterDeposit]).annualIncome).toBe(2.7);
  }
});

test("valued transfers handle backdated events, revaluation, clear and provider resets without changing cost or payouts", () => {
  const source = releaseStock(), valued = applyMarketValuation(source, price, at);
  const moved = M.applyTopUp(M.applyWithdraw(valued, 100, "2026-11-06"), 25, "2026-11-05");
  expect(moved.marketValuation?.recordedBalance).toBe(2425);
  expect(moved.investment).toEqual(source.investment);
  expect(moved.payouts).toEqual(source.payouts);
  expect(validMarketValuation(moved.marketValuation, moved)).toBe(true);
  expect(() => applyMarketValuation(moved, { ...price, priceUSD: 80 }, at)).toThrow(/shares/);
  // User confirms the existing share quantity after checking the provider.
  const { positionReviewRequired: _review, ...confirmed } = moved;
  const repriced = applyMarketValuation(confirmed, { ...price, priceUSD: 80 }, at);
  expect(repriced.marketValuation?.recordedBalance).toBe(2425);
  expect(repriced.balance).toBe(3000);
  expect(clearMarketValuation(repriced, at).balance).toBe(2425);
  const reset = M.applySetBalance(moved, 4000, "2026-11-07");
  expect(reset.marketValuation).toBeUndefined();
  expect(incomeBalance(reset)).toBe(4000);
  expect(portfolioTotals([reset]).annualIncome).toBe(216);
});

test("unanchored or forged valuation totals cannot be validated by unrelated transfer entries", () => {
  const valued = applyMarketValuation(releaseStock(), price, at);
  const transfer = M.applyTopUp(valued, 50, "2026-11-08");
  expect(validMarketValuation(transfer.marketValuation, { ...transfer, events: [] })).toBe(false);
  expect(validMarketValuation(transfer.marketValuation, { ...transfer, balance: transfer.balance + 1 })).toBe(false);
  expect(validMarketValuation(transfer.marketValuation, { ...transfer, events: transfer.events?.map((event, index) => index === transfer.events!.length - 1 ? { ...event, amount: 51 } : event) })).toBe(false);
});

test("invalid transfers and corrupt post-price ledgers fail closed without changing the holding", () => {
  const valued = applyMarketValuation(releaseStock(), price, at), before = structuredClone(valued);
  for (const amount of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) expect(() => applyValuationTransfer(valued, "topup", "2026-11-07", amount)).toThrow();
  expect(() => applyValuationTransfer(valued, "topup", "2026-02-30", 1)).toThrow();
  expect(() => applyValuationTransfer({ ...valued, investment: undefined }, "topup", "2026-11-07", 1)).toThrow();
  expect(() => applyValuationTransfer(valued, "withdraw", "2026-11-07", 4000)).toThrow();
  for (const event of [
    { type: "set" as const, amount: 1, date: "2026-11-08" },
    { type: "topup" as const, amount: -1, date: "2026-11-08" },
    { type: "topup" as const, amount: 1, date: "2026-02-30" },
  ]) expect(validMarketValuation(valued.marketValuation, { ...valued, events: [...valued.events!, event] })).toBe(false);
  const huge = { type: "topup" as const, amount: Number.MAX_SAFE_INTEGER / 100, date: "2026-11-08" };
  expect(validMarketValuation(valued.marketValuation, { ...valued, events: [...valued.events!, huge, huge] })).toBe(false);
  expect(valued).toEqual(before);
});

test("a manual provider balance update clears market metadata and establishes its own income basis", () => {
  const valued = applyMarketValuation(releaseStock(), price, at);
  const updated = M.applySetBalance(valued, 4000, "2026-11-07");
  expect(updated.marketValuation).toBeUndefined();
  expect(incomeBalance(updated)).toBe(4000);
  expect(portfolioTotals([updated]).annualIncome).toBe(216);
});

test("applying malformed prices or stale, future or wrong FX observations leaves the source unchanged", () => {
  const account = releaseStock(), before = structuredClone(account);
  for (const value of [{ ...price, priceUSD: 0 }, { ...price, priceUSD: -1 }, { ...price, priceUSD: Infinity }, { ...price, fxRate: 0 }, { ...price, fxDate: "2026-11-08" }, { ...price, fxDate: "2026-10-30" }, { ...price, fxDate: "2026-02-31" }]) expect(() => applyMarketValuation(account, value, at)).toThrow();
  expect(account).toEqual(before);
});

test("old dated estimates remain valid saved data while inconsistent or unsafe metadata is rejected", () => {
  const historic = applyMarketValuation(releaseStock(), { ...price, fxDate: "2020-01-01" }, Date.parse("2020-01-02T12:00:00Z"));
  expect(validMarketValuation(historic.marketValuation, historic)).toBe(true);
  for (const value of [{ ...historic.marketValuation, priceUSD: Infinity }, { ...historic.marketValuation, fxDate: "2020-01-03" }, { ...historic.marketValuation, appliedAt: "2020-02-31T12:00:00Z" }, { ...historic.marketValuation, recordedBalance: -1 }]) expect(validMarketValuation(value, historic)).toBe(false);
  expect(validMarketValuation(historic.marketValuation, { ...historic, balance: 1 })).toBe(false);
});

test("only dividend holdings with valid recorded quantities may receive a share-price scenario", () => {
  for (const account of [releaseSaver(), releaseDebt(), releaseStock({ investment: undefined }), releaseStock({ investment: { shares: -1, averagePriceGBP: 1 } })]) expect(() => applyMarketValuation(account, price, at)).toThrow();
  const value = applyMarketValuation(releaseStock(), price, at);
  expect(validMarketValuation(value.marketValuation, releaseSaver())).toBe(false);
  expect(validProductFields(releaseDebt({ marketValuation: value.marketValuation }))).toBe(false);
});

test("combined revaluation and debt totals are order-independent and never turn growth into cash income", () => {
  const accounts = releaseHoldingsAndDebts();
  accounts[1] = applyMarketValuation(accounts[1], price, at);
  const total = portfolioTotals(accounts);
  expect(total).toEqual({ money: 10750, debt: 1800, netPosition: 8950, annualIncome: 404, monthlyIncome: 33.67 });
  expect(portfolioTotals([...accounts].reverse())).toEqual(total);
  expect(M.recordedIncome(accounts)).toBe(0);
});
