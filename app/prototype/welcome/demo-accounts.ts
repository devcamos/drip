import { sampleCreditCard, type CreditCard } from "./credit-card";
import { STOCK_INSTRUMENTS, type StockInstrument } from "./stock-chart";
import { estimateStockValue, sampleStockHolding, type StockHoldingStats, type StockPriceInput } from "./stock-valuation";

export type ExampleAccount = "cash" | "stock" | "credit";
type BaseAccount = { id: string; name: string };
export type DemoCash = BaseAccount & { kind: "cash"; balance: number; ratePct: number };
export type DemoStock = BaseAccount & { kind: "stock"; instrumentId: StockInstrument["id"]; holding: StockHoldingStats; price: StockPriceInput | null };
export type DemoCredit = BaseAccount & { kind: "credit"; card: CreditCard };
export type DemoAccount = DemoCash | DemoStock | DemoCredit;
export type IncomePeriod = "month" | "year";

function example(kind: ExampleAccount, ordinal: number, id: string): DemoAccount {
  if (kind === "cash") return { id, kind, name: ordinal === 1 ? "Zopa" : `Savings ${ordinal}`, balance: ordinal === 1 ? 5000 : 1000, ratePct: ordinal === 1 ? 4.1 : 3.5 };
  if (kind === "credit") return {
    id, kind, name: ordinal === 1 ? "Barclaycard" : ordinal === 2 ? "Lloyds credit card" : `Credit card ${ordinal}`,
    card: ordinal === 1 ? sampleCreditCard() : { balance: 600, apr: 19.9, minimumPayment: 20, plannedPayment: 50, paymentDate: "2026-11-25" },
  };
  const instrument = STOCK_INSTRUMENTS[(ordinal - 1) % STOCK_INSTRUMENTS.length];
  return {
    id, kind, instrumentId: instrument.id,
    name: `${instrument.name}${ordinal > STOCK_INSTRUMENTS.length ? ` · Holding ${ordinal}` : ""}`,
    holding: ordinal === 1 ? { ...sampleStockHolding } : { shares: 20, averagePriceGBP: 90, recordedValueGBP: 2000, annualIncomeGBP: 64, yieldPct: 3.2 },
    price: null,
  };
}

/** Synthetic, in-memory accounts only. No identity, persistence or provider connection. */
export function samplePortfolio(): DemoAccount[] {
  return [example("cash", 1, "cash"), example("stock", 1, "stock"), example("credit", 1, "credit")];
}

export function addExample(accounts: DemoAccount[], kind: ExampleAccount) {
  const ordinal = accounts.filter(account => account.kind === kind).length + 1;
  const used = new Set(accounts.map(account => account.id));
  let suffix = ordinal;
  while (used.has(`${kind}-${suffix}`)) suffix += 1;
  const account = example(kind, ordinal, `${kind}-${suffix}`);
  return { accounts: [...accounts, account], account };
}

export function updateCredit(accounts: DemoAccount[], id: string, card: CreditCard): DemoAccount[] {
  return accounts.map(account => account.id === id && account.kind === "credit" ? { ...account, card: { ...card } } : account);
}

export function updateStockPrice(accounts: DemoAccount[], id: string, price: StockPriceInput | null): DemoAccount[] {
  return accounts.map(account => account.id === id && account.kind === "stock" ? { ...account, price: price ? { priceUSD: price.priceUSD, fx: { ...price.fx } } : null } : account);
}

export function portfolioSummary(accounts: DemoAccount[], now = Date.now()) {
  const pennies = (value: number) => Math.round(value * 100);
  let money = 0, debt = 0, annual = 0, stocks = 0, credits = 0, cash = 0, estimated = false;
  for (const account of accounts) {
    if (account.kind === "credit") { debt += pennies(account.card.balance); credits += 1; }
    else if (account.kind === "cash") {
      money += pennies(account.balance); annual += pennies(account.balance * account.ratePct / 100); cash += 1;
    } else {
      const value = estimateStockValue(account.price, account.holding, now);
      money += pennies(value?.valueGBP ?? account.holding.recordedValueGBP);
      annual += pennies(account.holding.annualIncomeGBP); stocks += 1;
      estimated ||= !!value;
    }
  }
  return { money: money / 100, debt: debt / 100, netPosition: (money - debt) / 100, annualIncome: annual / 100, monthlyIncome: Math.round(annual / 12) / 100, stocks, credits, cash, estimated };
}
