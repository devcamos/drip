export interface CreditCard {
  balance: number;
  apr: number;
  minimumPayment: number;
  plannedPayment?: number;
  paymentDate: string;
}

export type CreditCardDraft = Record<keyof CreditCard, string>;
export type CreditCardErrors = Partial<Record<keyof CreditCardDraft, string>>;

export function sampleCreditCard(): CreditCard {
  return { balance: 1200, apr: 24.9, minimumPayment: 35, plannedPayment: 75, paymentDate: "2026-11-20" };
}

export function creditCardDraft(card: CreditCard): CreditCardDraft {
  return {
    balance: String(card.balance), apr: String(card.apr), minimumPayment: String(card.minimumPayment),
    plannedPayment: card.plannedPayment === undefined ? "" : String(card.plannedPayment), paymentDate: card.paymentDate,
  };
}

function money(value: string): number | undefined {
  const text = value.trim(), parsed = Number(text);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(parsed) || parsed > 1_000_000_000_000) return;
  return Math.round(parsed * 100) / 100;
}

export function validateCreditCard(draft: CreditCardDraft): { card?: CreditCard; errors: CreditCardErrors } {
  const errors: CreditCardErrors = {};
  const balance = money(draft.balance), minimumPayment = money(draft.minimumPayment);
  const plannedPayment = draft.plannedPayment.trim() ? money(draft.plannedPayment) : undefined;
  for (const [key, value] of [["balance", balance], ["minimumPayment", minimumPayment]] as const) {
    if (value === undefined) errors[key] = "Enter a non-negative amount with up to two decimal places (maximum £1 trillion).";
  }
  if (draft.plannedPayment.trim() && plannedPayment === undefined) errors.plannedPayment = "Enter a non-negative amount with up to two decimal places, or leave it blank.";
  const aprText = draft.apr.trim(), apr = Number(aprText);
  if (!/^\d+(?:\.\d+)?$/.test(aprText) || !Number.isFinite(apr) || apr > Number.MAX_SAFE_INTEGER) errors.apr = "Enter a finite, non-negative APR. Use 0 for an interest-free rate.";
  const paymentDate = draft.paymentDate.trim();
  const date = new Date(paymentDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDate) errors.paymentDate = "Enter a valid payment due date.";
  if (Object.keys(errors).length) return { errors };
  return { card: { balance: balance!, apr, minimumPayment: minimumPayment!, plannedPayment, paymentDate }, errors };
}

export function creditCardWarnings(card: CreditCard): string[] {
  const warnings: string[] = [];
  if (card.minimumPayment > card.balance) warnings.push("The statement minimum is above the amount owed. Check the figures on your latest statement.");
  if (card.plannedPayment !== undefined && card.plannedPayment < card.minimumPayment) warnings.push("Your planned payment is below the statement minimum you entered.");
  if (card.plannedPayment !== undefined && card.plannedPayment > card.balance) warnings.push("Your planned payment is above the amount owed. Check the amount you intend to pay.");
  return warnings;
}

export function creditOverview(moneyBalance: number, card: CreditCard) {
  const moneyPennies = Math.round(moneyBalance * 100), debtPennies = Math.round(card.balance * 100);
  return { money: moneyPennies / 100, debt: debtPennies / 100, netPosition: (moneyPennies - debtPennies) / 100, minimumPayment: card.minimumPayment, plannedPayment: card.plannedPayment };
}
