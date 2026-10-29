import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { subscriptionSchema, type PushSubscription } from "./model";
export type SubscriptionEnvelope = { v: 1; iv: string; ct: string; tag: string };
const binding = (owner: string, device: string) => Buffer.from(`drip-push:v1:${owner}:${device}`);
export function sealSubscription(value: PushSubscription, key: Buffer, owner: string, device: string): SubscriptionEnvelope {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(binding(owner, device));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { v: 1, iv: iv.toString("base64url"), ct: ct.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}
export function openSubscription(value: SubscriptionEnvelope, key: Buffer, owner: string, device: string) {
  if (value.v !== 1) throw new Error("Unknown phone reminder storage version.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAAD(binding(owner, device));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return subscriptionSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ct, "base64url")), decipher.final()]).toString("utf8")));
}
