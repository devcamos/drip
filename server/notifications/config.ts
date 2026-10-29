import { createECDH } from "node:crypto";
import { authBaseURL } from "../../scripts/deployment-config.mjs";
export type PushConfig = { publicKey: string; privateKey: string; storageKey: Buffer; cronSecret: string; subject: string };
const keys = ["DRIP_PUSH_PUBLIC_KEY", "DRIP_PUSH_PRIVATE_KEY", "DRIP_PUSH_STORAGE_KEY", "CRON_SECRET"] as const;
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
  if (!keys.slice(0, 3).some(key => env[key])) return null;
  if (!keys.every(key => !!env[key]?.trim())) throw new Error("Incomplete phone reminder configuration.");
  const publicKey = env.DRIP_PUSH_PUBLIC_KEY!, privateKey = env.DRIP_PUSH_PRIVATE_KEY!;
  const pub = Buffer.from(publicKey, "base64url"), priv = Buffer.from(privateKey, "base64url"), storageKey = Buffer.from(env.DRIP_PUSH_STORAGE_KEY!, "base64url");
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32 || storageKey.length !== 32 || env.CRON_SECRET!.length < 32) throw new Error("Invalid phone reminder configuration.");
  const pair = createECDH("prime256v1"); pair.setPrivateKey(priv);
  if (!pair.getPublicKey().equals(pub)) throw new Error("Phone reminder key pair mismatch.");
  const subject = new URL(authBaseURL(env) ?? "https://drip-one-xi.vercel.app").origin;
  if (!subject.startsWith("https://")) throw new Error("Phone reminder contact must use HTTPS.");
  return { publicKey, privateKey, storageKey, cronSecret: env.CRON_SECRET!, subject };
}
