import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyTopUp, applyWithdraw, applySetBalance, recordedIncome, depositsInMonth } from "../lib/maths";
import { applyMarketValuation } from "../lib/market-valuation";
import { releaseSaver, releaseStock } from "./saved-experience-fixtures";
import { releaseData, releaseDebt } from "./saved-experience-fixtures";
import { activeAccounts, archiveAccount, restoreAccount, validLifecycleFields } from "../lib/account-lifecycle";
import { portfolioTotals } from "../lib/credit-card";
import { dividendPortfolio } from "../lib/dividend-portfolio";
import { debtPaymentReminders, nextReminder, paymentDue, paymentReminders, reminderSchedule } from "../lib/payment-reminders";
import { paymentCalendar } from "../lib/payment-calendar";
import { dataFormatVersion } from "../lib/data-format";
import { cloudPayload } from "../lib/cloud-payload";
import { investmentReturn } from "../lib/stock-investment";
import { pendingBonuses, projection } from "../lib/maths";
import { deploymentProblems } from "../scripts/deployment-config.mjs";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

it.each([
  ["top up", applyTopUp], ["withdraw", applyWithdraw], ["replace balance", applySetBalance],
] as const)("rejects a future-dated actual %s without mutating the source", (_name, change) => {
  const account = releaseSaver(), before = structuredClone(account);
  expect(() => change(account, 500, "2026-11-09")).toThrow(/future|today/i);
  expect(account).toEqual(before);
});

it("requires a share review before a cash withdrawal can be overwritten by a new quote", () => {
  const account = applyWithdraw(releaseStock(), 2500, "2026-11-08");
  expect(account.balance).toBe(0);
  expect(account.investment?.shares).toBe(50);
  expect(() => applyMarketValuation(account, { priceUSD: 100, fxRate: .75, fxDate: "2026-11-08" })).toThrow(/share|position/i);
});

it("rejects an impossible actual transaction date", () => {
  expect(() => applySetBalance(releaseSaver(), 100, "2026-02-30")).toThrow(/date/i);
});
it("accepts today's actual change without mutating the source", () => {
  const before = releaseSaver(); expect(applyTopUp(before, 50, "2026-11-08").balance).toBe(5050); expect(before.balance).toBe(5000);
});
it("archives a complete record without changing its payments, position or source", () => {
  const account = releaseStock({ payouts: [{ date: "2026-11-01", amount: 100, kind: "actual", incomeType: "dividend" }] });
  const archived = archiveAccount(account); expect(archived).toEqual({ ...account, archivedAt: "2026-11-08T12:00:00.000Z" }); expect(account.archivedAt).toBeUndefined();
});
it("excludes archived assets and debts from the current financial position", () => {
  const totals = portfolioTotals([releaseSaver(), archiveAccount(releaseStock()), archiveAccount(releaseDebt())]);
  expect(totals.money).toBe(5000); expect(totals.debt).toBe(0); expect(totals.monthlyIncome).toBe(17.08);
});
it("preserves archived dividends but excludes their value and predicted income", () => {
  const account = archiveAccount(releaseStock({ payouts: [{ date: "2026-11-01", amount: 100, kind: "actual", incomeType: "dividend" }] }));
  const portfolio = dividendPortfolio([account], "2026-11-08"); expect(portfolio.received).toBe(100); expect(portfolio.thisMonth).toBe(100); expect(portfolio.value).toBe(0); expect(portfolio.monthlyEstimate).toBe(0); expect(portfolio.holdings).toEqual([]);
  expect(recordedIncome([account], "2026-11", "2026-11-08")).toBe(100);
  expect(depositsInMonth([{ ...account, events: [{ type: "topup", amount: 50, date: "2026-11-01" }] }], "2026-11")).toBe(50);
});
it("excludes an archived pending bonus from forecasts while retaining received bonus income", () => {
  const account = archiveAccount(releaseSaver({ bonus: { amount: 50, expectedDate: "2026-12-01" }, payouts: [{ date: "2026-11-01", amount: 10, kind: "actual", incomeType: "bonus" }] }));
  expect(pendingBonuses([account])).toBe(0);
  expect(recordedIncome([account], "2026-11", "2026-11-08")).toBe(10);
  expect(projection([account], 1, 0, "2026-11-08")[0].income).toBe(0);
});
it("restores an archived record without losing its historical data", () => {
  const account = releaseStock(); expect(restoreAccount(archiveAccount(account))).toEqual(account); expect(activeAccounts([account, archiveAccount(releaseDebt())])).toEqual([account]);
});
it("rejects malformed archive and position review metadata", () => {
  expect(validLifecycleFields({ ...releaseStock(), archivedAt: "not-a-date" })).toBe(false);
  expect(validLifecycleFields({ ...releaseSaver(), positionReviewRequired: true })).toBe(false);
  expect(validLifecycleFields({ ...releaseStock(), positionReviewRequired: false } as never)).toBe(false);
});
it("uses format4 only for new preservation-sensitive metadata", () => {
  expect(dataFormatVersion(releaseData([archiveAccount(releaseStock())]))).toBe(4);
  expect(dataFormatVersion(releaseData([applyWithdraw(releaseStock(), 100, "2026-11-08")]))).toBe(4);
  expect(dataFormatVersion(releaseData([releaseDebt({ creditCard: { apr: 0, minimumPayment: 20, statementPaid: true } })]))).toBe(4);
  expect(dataFormatVersion(releaseData([releaseSaver()]))).toBe(1); expect(dataFormatVersion(releaseData([releaseStock()]))).toBe(2); expect(dataFormatVersion(releaseData([releaseDebt()]))).toBe(3);
});
it("keeps archive and paid-statement metadata portable while excluding device nicknames", () => {
  const saved = cloudPayload(releaseData([archiveAccount(releaseStock({ label: "secret local name", positionReviewRequired: true })), releaseDebt({ creditCard: { apr: 0, minimumPayment: 20, statementPaid: true } })]));
  expect(saved.accounts[0].archivedAt).toBeTruthy(); expect(saved.accounts[0].positionReviewRequired).toBe(true); expect(saved.accounts[1].creditCard?.statementPaid).toBe(true); expect(saved.accounts[0]).not.toHaveProperty("label");
});
it("keeps repayment amounts out of income reminders and forecasts", () => {
  const debt = releaseDebt(); expect(debtPaymentReminders([debt], "2026-11-08")[0].amount).toBe(75); expect(paymentReminders([debt], "2026-11-08")).toEqual([]); expect(portfolioTotals([debt]).monthlyIncome).toBe(0);
});
it("retains an overdue statement instead of guessing the next month's date", () => {
  const reminder = debtPaymentReminders([releaseDebt({ nextPayoutDate: "2026-10-20" })], "2026-11-08")[0]; expect(reminder.date).toBe("2026-10-20"); expect(reminder.overdue).toBe(true);
});
it("keeps a minimum-payment reminder when the recorded plan is explicitly zero", () => {
  const account = releaseDebt({ creditCard: { apr: 0, minimumPayment: 35, plannedPayment: 0 } });
  expect(debtPaymentReminders([account], "2026-11-08")).toHaveLength(1);
  expect(reminderSchedule([account], "2026-11-08", "UTC").plans).toHaveLength(1);
});
it("suppresses settled or zero-balance statements without inventing payments", () => {
  const paid = releaseDebt({ creditCard: { apr: 0, minimumPayment: 35, statementPaid: true } }); expect(debtPaymentReminders([paid, releaseDebt({ balance: 0 })], "2026-11-08")).toEqual([]); expect(paid.balance).toBe(1200); expect(paid.payouts).toEqual([]);
});
it("omits archived accounts from both reminder lists and phone schedules", () => {
  const accounts = [archiveAccount(releaseSaver()), archiveAccount(releaseDebt())]; expect(paymentReminders(accounts, "2026-11-08")).toEqual([]); expect(debtPaymentReminders(accounts, "2026-11-08")).toEqual([]); expect(reminderSchedule(accounts, "2026-11-08", "Europe/London").plans).toEqual([]);
});
it("schedules a private one-off debt date without sending names or amounts", () => {
  const schedule = reminderSchedule([releaseDebt()], "2026-11-08", "Europe/London"); expect(schedule.plans).toEqual([{ anchor: "2026-11-20", frequency: "monthly", once: true }]); expect(JSON.stringify(schedule)).not.toMatch(/Barclaycard|1200|minimum|planned/);
});
it("expires one-off plans instead of repeating them in subsequent statements", () => {
  const plan = { anchor: "2026-11-08", frequency: "monthly" as const, once: true as const }; expect(paymentDue(plan, "2026-11-08")).toBe(true); expect(paymentDue(plan, "2026-12-08")).toBe(false); expect(nextReminder({ timeZone: "UTC", plans: [plan] }, "2026-11-09")).toBeNull();
});
it("shows one debt calendar entry and separates outgoing totals from expected income", () => {
  const calendar = paymentCalendar([releaseDebt()], "2026-11-08")!; const payments = calendar.months.flatMap(month => month.payments); expect(payments).toHaveLength(1); expect(payments[0].repayment).toBe(true); expect(calendar.months[0].amount).toBe(0); expect(calendar.months[0].repaymentAmount).toBe(75);
});
it("preserves purchase cost and recorded dividends while pausing misleading return figures", () => {
  const original = releaseStock({ payouts: [{ kind: "actual", incomeType: "dividend", amount: 100, date: "2026-11-01" }] }); const changed = applyWithdraw(original, 2500, "2026-11-08"); expect(changed.investment).toEqual(original.investment); expect(changed.payouts).toEqual(original.payouts); expect(investmentReturn(changed)).toBeNull();
});
it("requires all notification configuration when the deployment declares push as required", () => {
  const errors = deploymentProblems({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "drip-preview.vercel.app", DATABASE_URL: "postgresql://fixture@db.example/drip", BETTER_AUTH_SECRET: "x".repeat(48), DRIP_PUSH_REQUIRED: "1" }); expect(errors).toContain("DRIP_PUSH_PUBLIC_KEY is missing for required phone reminders."); expect(errors).toContain("CRON_SECRET is missing for required phone reminders.");
});
