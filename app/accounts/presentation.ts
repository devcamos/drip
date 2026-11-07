import type { Account } from "@/lib/types";
import type { Identity } from "@/lib/identity";
import { displayProvider } from "@/lib/products";

export type IncomePeriod = "month" | "year";
export type AccountsTotals = Readonly<{
  money: number;
  debt: number;
  netPosition: number;
  monthlyIncome: number;
  annualIncome: number;
}>;
export type CreditPlan = Readonly<{
  accountId: string;
  name: string;
  apr: number;
  minimumPayment: number;
  plannedPayment?: number;
  paymentDate: string;
}>;
export type NextAccountPayment = Readonly<{
  accountId: string;
  name: string;
  date: string;
  amount: number;
}>;
export type AccountCounts = Readonly<{ cash: number; stocks: number; credits: number }>;

export function profileInitials(identity?: Pick<Identity, "handle">): string {
  const handle = identity?.handle?.trim();
  if (!handle) return "dr";
  const parts = handle.split("_").filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map(part => part[0]).join("") : handle.slice(0, 2)).toLowerCase();
}

export function accountTitle(account: Account): string {
  return account.holdingName?.trim() || account.label?.trim() || displayProvider(account.provider);
}

export function accountDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
    : "Date not set";
}

export function calendarParts(value: string): { month: string; day: string } | null {
  if (accountDate(value) === "Date not set") return null;
  const date = new Date(`${value}T12:00:00Z`);
  return {
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date),
    day: new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" }).format(date),
  };
}
