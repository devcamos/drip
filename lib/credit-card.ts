import type { Account, CreditCardTerms } from "./types";
import { incomeBalance } from "./market-valuation";

type Categorised = Partial<Pick<Account, "productCategory">>;
const moneyLimit = 1_000_000_000_000;
const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= moneyLimit && Math.round((value + Number.EPSILON) * 100) / 100 === value;
export const validCreditAmount = money;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function isCreditAccount(account: Categorised): boolean { return account.productCategory === "credit-card"; }
export function accountAssets<T extends Categorised>(accounts: T[]): T[] { return accounts.filter(account => !isCreditAccount(account)); }

export function validCreditCardTerms(value: unknown): value is CreditCardTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as CreditCardTerms;
  return typeof v.apr === "number" && Number.isFinite(v.apr) && v.apr >= 0 && v.apr <= Number.MAX_SAFE_INTEGER && money(v.minimumPayment) &&
    (v.plannedPayment === undefined || money(v.plannedPayment));
}

export type CreditCardDraft = { balance: string; apr: string; minimumPayment: string; plannedPayment: string; paymentDate: string };
export type CreditCardErrors = Partial<Record<keyof CreditCardDraft, string>>;
export function creditCardDraft(account?: Account): CreditCardDraft {
  return { balance: account ? String(account.balance) : "", apr: account?.creditCard ? String(account.creditCard.apr) : "",
    minimumPayment: account?.creditCard ? String(account.creditCard.minimumPayment) : "", plannedPayment: account?.creditCard?.plannedPayment === undefined ? "" : String(account.creditCard.plannedPayment), paymentDate: account?.nextPayoutDate ?? "" };
}

const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
function parseMoney(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 30 || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim())) return;
  const parsed = Number(value.trim());
  return money(parsed) ? roundMoney(parsed) : undefined;
}

/** Only these form fields can enter the saved credit record. */
export function validateCreditCardDraft(input: unknown): { value?: { balance: number; creditCard: CreditCardTerms; nextPayoutDate: string }; errors: CreditCardErrors } {
  const fields: (keyof CreditCardDraft)[] = ["balance", "apr", "minimumPayment", "plannedPayment", "paymentDate"];
  const draft = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const errors: CreditCardErrors = {};
  const balance = parseMoney(draft.balance), minimumPayment = parseMoney(draft.minimumPayment);
  const planEmpty = draft.plannedPayment === undefined || (typeof draft.plannedPayment === "string" && !draft.plannedPayment.trim());
  const plannedPayment = planEmpty ? undefined : parseMoney(draft.plannedPayment);
  if (balance === undefined) errors.balance = "Enter a non-negative amount with up to two decimal places (maximum £1 trillion).";
  if (minimumPayment === undefined) errors.minimumPayment = "Enter the statement minimum with up to two decimal places.";
  if (!planEmpty && plannedPayment === undefined) errors.plannedPayment = "Enter a non-negative planned payment, or leave it blank.";
  const aprText = typeof draft.apr === "string" ? draft.apr.trim() : "", apr = Number(aprText);
  if (aprText.length > 40 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(aprText) || !Number.isFinite(apr) || apr > Number.MAX_SAFE_INTEGER) errors.apr = "Enter a finite, non-negative APR. Use 0 for an interest-free rate.";
  const paymentDate = typeof draft.paymentDate === "string" ? draft.paymentDate.trim() : "";
  if (!isCalendarDay(paymentDate)) errors.paymentDate = "Enter a valid statement payment due date.";
  if (Object.keys(draft).some(field => !fields.includes(field as keyof CreditCardDraft))) errors.balance = "Use only the credit-card statement fields.";
  if (Object.keys(errors).length) return { errors };
  return { value: { balance: balance!, creditCard: { apr, minimumPayment: minimumPayment!, ...(plannedPayment === undefined ? {} : { plannedPayment }) }, nextPayoutDate: paymentDate }, errors };
}

export function creditCardWarnings(account: Account): string[] {
  if (!isCreditAccount(account) || !account.creditCard) return [];
  const { minimumPayment, plannedPayment } = account.creditCard;
  const warnings: string[] = [];
  if (minimumPayment > account.balance) warnings.push("The statement minimum is above the amount owed. Check your latest statement.");
  if (plannedPayment !== undefined && plannedPayment < minimumPayment) warnings.push("Your planned payment is below the statement minimum you entered.");
  if (plannedPayment !== undefined && plannedPayment > account.balance) warnings.push("Your planned payment is above the amount owed. Check the amount you intend to pay.");
  return warnings;
}

export function portfolioTotals(accounts: Account[]) {
  let assetPennies = 0, debtPennies = 0, annual = 0;
  for (const account of accounts) {
    if (isCreditAccount(account)) debtPennies += Math.round(account.balance * 100);
    else {
      assetPennies += Math.round(Math.max(account.balance, 0) * 100);
      annual += Math.max(incomeBalance(account), 0) * Math.max(account.ratePct, 0) / 100;
    }
  }
  return { money: assetPennies / 100, debt: debtPennies / 100, netPosition: (assetPennies - debtPennies) / 100, monthlyIncome: roundMoney(annual / 12), annualIncome: roundMoney(annual) };
}
