import { expect, test } from "vitest";
import { creditCardDraft, creditCardWarnings, creditOverview, sampleCreditCard, validateCreditCard, type CreditCardDraft } from "../app/prototype/welcome/credit-card";

const fields = (changes: Partial<CreditCardDraft> = {}) => ({ ...creditCardDraft(sampleCreditCard()), ...changes });

test("recorded debt reduces tracked net position while assets and repayment figures stay separate", () => {
  expect(creditOverview(7500, sampleCreditCard())).toEqual({ money: 7500, debt: 1200, netPosition: 6300, minimumPayment: 35, plannedPayment: 75 });
});

test("zero debt leaves the full recorded asset balance in net position", () => {
  expect(creditOverview(7500, { ...sampleCreditCard(), balance: 0 }).netPosition).toBe(7500);
});

test("debt above assets produces a negative net position without clamping it", () => {
  expect(creditOverview(500, sampleCreditCard()).netPosition).toBe(-700);
});

test("net position uses pennies rather than accumulating floating-point subtraction errors", () => {
  expect(creditOverview(0.3, { ...sampleCreditCard(), balance: 0.2 }).netPosition).toBe(0.1);
});

test("each fresh sample is independent so resets cannot inherit an edited amount", () => {
  const edited = sampleCreditCard(); edited.balance = 10;
  expect(sampleCreditCard().balance).toBe(1200);
});

test("a complete statement draft round-trips without changing its recorded figures", () => {
  expect(validateCreditCard(fields())).toEqual({ card: sampleCreditCard(), errors: {} });
});

test("an optional blank planned payment stays unset rather than becoming a zero payment", () => {
  const result = validateCreditCard(fields({ plannedPayment: "  " }));
  expect(result.errors).toEqual({}); expect(result.card!.plannedPayment).toBeUndefined();
  expect(creditCardDraft(result.card!).plannedPayment).toBe("");
});

test("zero amounts and an interest-free APR are accepted", () => {
  expect(validateCreditCard(fields({ balance: "0", apr: "0", minimumPayment: "0", plannedPayment: "0" })).card).toMatchObject({ balance: 0, apr: 0, minimumPayment: 0, plannedPayment: 0 });
});

test("APR is not capped by the savings-account percentage limit", () => {
  expect(validateCreditCard(fields({ apr: "125.5" })).card?.apr).toBe(125.5);
});

test("required statement amounts and APR cannot be omitted", () => {
  for (const key of ["balance", "minimumPayment", "apr"] as const) expect(validateCreditCard(fields({ [key]: " " })).errors[key]).toBeTruthy();
});

test("invalid or unsafe money is rejected while exact pennies and the supported bound are retained", () => {
  for (const key of ["balance", "minimumPayment", "plannedPayment"] as const) {
    for (const value of ["-1", "NaN", "Infinity", "1e3", "1.001", "1000000000000.01"]) expect(validateCreditCard(fields({ [key]: value })).errors[key]).toBeTruthy();
  }
  expect(validateCreditCard(fields({ balance: " 1200.29 ", plannedPayment: "25.01" })).card).toMatchObject({ balance: 1200.29, plannedPayment: 25.01 });
  expect(validateCreditCard(fields({ balance: "1000000000000" })).card?.balance).toBe(1_000_000_000_000);
});

test("APR rejects negative, malformed and non-finite inputs", () => {
  for (const apr of ["-1", "NaN", "Infinity", "25%", "1e999", "9007199254740992"]) expect(validateCreditCard(fields({ apr })).errors.apr).toBeTruthy();
});

test("payment dates are real calendar dates, with leap days and recorded past dates supported", () => {
  for (const paymentDate of ["", "2026-02-30", "2026-02-29", "2026-13-01", "20/11/2026"]) expect(validateCreditCard(fields({ paymentDate })).errors.paymentDate).toBeTruthy();
  for (const paymentDate of ["2028-02-29", "2020-01-01"]) expect(validateCreditCard(fields({ paymentDate })).card?.paymentDate).toBe(paymentDate);
});

test("statement and plan mismatches produce review warnings without altering the saved numbers", () => {
  const low = { ...sampleCreditCard(), plannedPayment: 20 };
  expect(creditCardWarnings(low)).toEqual(["Your planned payment is below the statement minimum you entered."]);
  expect(creditCardWarnings({ ...sampleCreditCard(), plannedPayment: undefined })).toEqual([]);
  const high = { ...sampleCreditCard(), balance: 10, minimumPayment: 35, plannedPayment: 75 };
  expect(creditCardWarnings(high)).toHaveLength(2);
  expect(validateCreditCard(creditCardDraft(high)).card).toEqual(high);
  expect(creditOverview(7500, high).netPosition).toBe(7490);
});
