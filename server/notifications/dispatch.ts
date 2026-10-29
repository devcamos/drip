import { randomUUID } from "node:crypto";
import { dateInZone, paymentDue } from "@/lib/payment-reminders";
import type { PushSubscription } from "./model";
import type { ReminderStore } from "./store";

export type ReminderPayload = { type: "payment-reminder" | "notification-test"; date: string };
export type PushSender = (subscription: PushSubscription, payload: ReminderPayload) => Promise<unknown>;
export function providerStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
}

/** Leases and same-day receipts tolerate overlapping cron invocations. No DB lock spans a network request. */
export async function dispatchReminders(store: ReminderStore, send: PushSender, now = new Date(), budgetMs = 240_000) {
  const result = { inspected: 0, sent: 0, skipped: 0, expired: 0, failed: 0, deferred: false };
  const deadline = Date.now() + budgetMs;
  let after: string | null = null;
  while (true) {
    const rows = await store.candidates(after, now);
    if (!rows.length) break;
    for (let offset = 0; offset < rows.length; offset += 8) {
      if (Date.now() >= deadline) { result.deferred = true; return result; }
      const batch = await Promise.allSettled(rows.slice(offset, offset + 8).map(async row => {
        result.inspected++;
        const day = dateInZone(now, row.schedule.timeZone);
        if (!row.schedule.plans.some(plan => paymentDue(plan, day))) { await store.advance(row, day, null, false); result.skipped++; return; }
        const token = randomUUID();
        if (!await store.claim(row, day, token, now)) { result.skipped++; return; }
        try {
          await send(store.subscription(row), { type: "payment-reminder", date: day });
          await store.advance(row, day, token, true);
          result.sent++;
        } catch (error) {
          const gone = [404, 410].includes(providerStatus(error) ?? 0);
          await store.failed(row, token, gone);
          if (gone) result.expired++; else result.failed++;
        }
      }));
      // Drain every in-flight delivery before returning an unexpected DB failure.
      // Otherwise a retry could overlap work still running in this invocation.
      const rejected = batch.find(item => item.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
    after = rows.at(-1)!.id;
  }
  return result;
}
