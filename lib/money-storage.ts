import type { Account, AppData, BalanceEvent, Payout, Snapshot } from "./types";

/** Money values are pounds inside the app and integer pence in encrypted storage. */
export interface StoredPenceAccount extends Omit<Account, "balance" | "bonus" | "payouts" | "events" | "creditCard" | "marketValuation"> {
  balance: number;
  currency: "GBP";
  bonus?: { amount: number; expectedDate: string };
  payouts: Array<Omit<Payout, "amount"> & { id: string; amount: number }>;
  events?: Array<Omit<BalanceEvent, "amount"> & { id: string; amount: number }>;
  creditCard?: { apr: number; minimumPayment: number; plannedPayment?: number; statementPaid?: true };
  marketValuation?: { priceUSD: number; fxRate: number; fxDate: string; appliedAt: string; recordedBalance: number };
}
export type StoredPenceSnapshot = Omit<Snapshot, "totalBalance" | "monthlyIncome" | "deposits" | "withdrawals"> & {
  totalBalance: number; monthlyIncome: number; deposits?: number; withdrawals?: number;
};
export interface StoredPenceAppData extends Omit<AppData, "accounts" | "snapshots" | "projection"> {
  money: "pence";
  accounts: StoredPenceAccount[];
  snapshots: StoredPenceSnapshot[];
  projection?: { monthlyDeposit: number; years: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const safePence = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
/** Convert GBP pounds to pence while removing harmless IEEE-754 representation noise. */
export function toPence(pounds: number): number {
  if (!Number.isFinite(pounds)) throw new Error("Money amount must be finite.");
  const pence = Math.round(Number((pounds * 100).toPrecision(15)));
  if (!Number.isSafeInteger(pence)) throw new Error("Money amount is too large to store safely.");
  return pence;
}
export function fromPence(pence: number): number {
  if (!Number.isSafeInteger(pence)) throw new Error("Stored money must be integer pence.");
  return pence / 100;
}

/** Give legacy history stable, unique IDs before it can be saved or replayed. */
export function withStableMoneyIds(data: AppData): AppData {
  return {
    ...data,
    accounts: data.accounts.map(account => {
      const used = new Set<string>();
      const ensure = <T extends { id?: string }>(items: T[], kind: "event" | "payout"): Array<T & { id: string }> => items.map((item, index) => {
        const stableLegacyId = `legacy-${kind}-${encodeURIComponent(account.id)}-${index}`;
        let id = typeof item.id === "string" && item.id.trim() ? item.id : stableLegacyId;
        let suffix = 1;
        while (used.has(id)) id = `${stableLegacyId}-${suffix++}`;
        used.add(id);
        return { ...item, id };
      });
      return { ...account, events: account.events ? ensure(account.events, "event") : undefined, payouts: ensure(account.payouts ?? [], "payout") };
    }),
  };
}

/** Encode a domain AppData object for durable storage. Safe to call repeatedly. */
export function toStoredPence(data: AppData): StoredPenceAppData {
  if (hasPenceMarker(data) && !isStoredPenceAppData(data)) throw new Error("Invalid integer-pence data.");
  if (isStoredPenceAppData(data)) return data;
  const withIds = withStableMoneyIds(data);
  return {
    ...withIds,
    money: "pence",
    accounts: withIds.accounts.map(account => ({
      ...account,
      balance: toPence(account.balance),
      currency: "GBP",
      bonus: account.bonus ? { ...account.bonus, amount: toPence(account.bonus.amount) } : undefined,
      payouts: (account.payouts ?? []).map(payout => ({ ...payout, amount: toPence(payout.amount), id: payout.id! })),
      events: account.events?.map(event => ({ ...event, amount: toPence(event.amount), id: event.id! })),
      creditCard: account.creditCard ? {
        ...account.creditCard,
        minimumPayment: toPence(account.creditCard.minimumPayment),
        plannedPayment: account.creditCard.plannedPayment === undefined ? undefined : toPence(account.creditCard.plannedPayment),
      } : undefined,
      marketValuation: account.marketValuation ? {
        ...account.marketValuation,
        recordedBalance: toPence(account.marketValuation.recordedBalance),
      } : undefined,
    })),
    snapshots: data.snapshots.map(snapshot => ({
      ...snapshot,
      totalBalance: toPence(snapshot.totalBalance),
      monthlyIncome: toPence(snapshot.monthlyIncome),
      deposits: snapshot.deposits === undefined ? undefined : toPence(snapshot.deposits),
      withdrawals: snapshot.withdrawals === undefined ? undefined : toPence(snapshot.withdrawals),
    })),
    projection: data.projection ? { ...data.projection, monthlyDeposit: toPence(data.projection.monthlyDeposit) } : undefined,
  };
}

/** Validate the pence wire format before accepting an encrypted restore. */
export function isStoredPenceAppData(value: unknown): value is StoredPenceAppData {
  if (!isRecord(value) || value.version !== 1 || value.money !== "pence" || !Array.isArray(value.accounts) || !Array.isArray(value.snapshots)) return false;
  if (value.projection !== undefined && (!isRecord(value.projection) || !safePence(value.projection.monthlyDeposit))) return false;
  if (!value.accounts.every(account => {
    if (!isRecord(account) || account.currency !== "GBP" || !safePence(account.balance) || !Array.isArray(account.payouts)) return false;
    if (account.bonus !== undefined && (!isRecord(account.bonus) || !safePence(account.bonus.amount))) return false;
    if (account.creditCard !== undefined && (!isRecord(account.creditCard) || !safePence(account.creditCard.minimumPayment) || (account.creditCard.plannedPayment !== undefined && !safePence(account.creditCard.plannedPayment)))) return false;
    if (account.marketValuation !== undefined && (!isRecord(account.marketValuation) || !safePence(account.marketValuation.recordedBalance))) return false;
    const validRows = (rows: unknown, kind: "event" | "payout") => rows === undefined || (Array.isArray(rows) && rows.every((row: unknown) => {
      if (!isRecord(row) || !safePence(row.amount) || typeof row.id !== "string" || !row.id.trim()) return false;
      if (kind === "event" && (typeof row.type !== "string" || typeof row.date !== "string")) return false;
      if (kind === "payout" && (typeof row.kind !== "string" || typeof row.date !== "string")) return false;
      return true;
    }));
    if (!validRows(account.events, "event") || !validRows(account.payouts, "payout")) return false;
    const ids = [...(Array.isArray(account.events) ? account.events : []), ...(Array.isArray(account.payouts) ? account.payouts : [])].map((row: any) => row.id);
    return new Set(ids).size === ids.length;
  })) return false;
  return value.snapshots.every(snapshot => isRecord(snapshot) && safePence(snapshot.totalBalance) && safePence(snapshot.monthlyIncome) &&
    (snapshot.deposits === undefined || safePence(snapshot.deposits)) && (snapshot.withdrawals === undefined || safePence(snapshot.withdrawals)));
}

/** Decode either the new pence wire format or a legacy pounds object. */
export function fromStoredPence(value: unknown): AppData {
  if (!isStoredPenceAppData(value)) throw new Error("Invalid integer-pence data.");
  const { money: _money, ...legacyShape } = value;
  return {
    ...legacyShape,
    accounts: value.accounts.map(account => {
      const { currency: _currency, ...domain } = account;
      return {
        ...domain,
        balance: fromPence(account.balance),
        ...(account.bonus ? { bonus: { ...account.bonus, amount: fromPence(account.bonus.amount) } } : {}),
        payouts: account.payouts.map(payout => ({ ...payout, amount: fromPence(payout.amount) })),
        ...(account.events ? { events: account.events.map(event => ({ ...event, amount: fromPence(event.amount) })) } : {}),
        ...(account.creditCard ? { creditCard: {
          ...account.creditCard,
          minimumPayment: fromPence(account.creditCard.minimumPayment),
          ...(account.creditCard.plannedPayment === undefined ? {} : { plannedPayment: fromPence(account.creditCard.plannedPayment) }),
        } } : {}),
        ...(account.marketValuation ? { marketValuation: {
          ...account.marketValuation,
          recordedBalance: fromPence(account.marketValuation.recordedBalance),
        } } : {}),
      };
    }),
    snapshots: value.snapshots.map(snapshot => ({
      ...snapshot,
      totalBalance: fromPence(snapshot.totalBalance),
      monthlyIncome: fromPence(snapshot.monthlyIncome),
      ...(snapshot.deposits === undefined ? {} : { deposits: fromPence(snapshot.deposits) }),
      ...(snapshot.withdrawals === undefined ? {} : { withdrawals: fromPence(snapshot.withdrawals) }),
    })),
    ...(value.projection ? { projection: { ...value.projection, monthlyDeposit: fromPence(value.projection.monthlyDeposit) } } : {}),
  } as AppData;
}

export function hasPenceMarker(value: unknown): boolean {
  return isRecord(value) && value.money === "pence";
}
