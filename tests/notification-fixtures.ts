import { createECDH, randomBytes, randomUUID } from "node:crypto";
import type { Account } from "../lib/types";
export const holding = (extra: Partial<Account> = {}): Account => ({ id: "holding", productCategory: "stocks-funds", provider: "Trading212", holdingName: "Realty Income", label: "Private name", balance: 1200, ratePct: 5, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2026-01-31", createdAt: "2026-01-01T12:00:00Z", colour: "#176b9a", payouts: [], ...extra });
export function pushFixture() {
  const pair = createECDH("prime256v1"); pair.generateKeys();
  const publicKey = pair.getPublicKey().toString("base64url"), privateKey = pair.getPrivateKey().toString("base64url"), storageKey = randomBytes(32);
  const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: publicKey, auth: randomBytes(16).toString("base64url") } };
  const schedule = { timeZone: "Europe/London", plans: [{ anchor: "2026-10-29", frequency: "monthly" as const }] };
  const config = { publicKey, privateKey, storageKey, cronSecret: randomBytes(32).toString("base64url"), subject: "https://drip.example" };
  const env = { DRIP_PUSH_PUBLIC_KEY: publicKey, DRIP_PUSH_PRIVATE_KEY: privateKey, DRIP_PUSH_STORAGE_KEY: storageKey.toString("base64url"), CRON_SECRET: config.cronSecret, BETTER_AUTH_URL: config.subject };
  return { subscription, schedule, config, env, device: randomUUID() };
}
