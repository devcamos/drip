import { ECDH } from "node:crypto";
import { z } from "zod";
import { validDate } from "@/lib/products";

const base64 = (size: number) => z.string().max(120).refine(value => {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === size && bytes.toString("base64url") === value.split("=")[0];
});
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "push.apple.com" || url.hostname.endsWith(".push.apple.com") || url.hostname === "push.services.mozilla.com" || url.hostname.endsWith(".push.services.mozilla.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export const subscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(allowedPushEndpoint),
  keys: z.object({ p256dh: base64(65).refine(value => { try { ECDH.convertKey(Buffer.from(value, "base64url"), "prime256v1"); return true; } catch { return false; } }), auth: base64(16) }).strict(),
}).strict();
const date = z.string().refine(value => validDate(value) && Number(value.slice(0, 4)) >= 100);
export const scheduleSchema = z.object({
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en-GB", { timeZone: value }); return true; } catch { return false; } }),
  plans: z.array(z.object({ anchor: date, frequency: z.enum(["daily", "monthly", "quarterly", "annually"]), skipDate: date.optional() }).strict()).max(500),
}).strict();
export const registrationSchema = z.object({ subscription: subscriptionSchema, schedule: scheduleSchema }).strict();
export type PushSubscription = z.infer<typeof subscriptionSchema>;
export const devicePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReminderError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
