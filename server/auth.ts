import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { passwordLogin } from "./password-login";

neonConfig.webSocketConstructor = process.env.HTTPS_PROXY
  ? class extends WebSocket { constructor(address: string, protocols?: string | string[]) { super(address, protocols, { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY!) }); } }
  : WebSocket;

const createAuth = () => betterAuth(authOptions());
let instance: ReturnType<typeof createAuth> | undefined;
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Cloud recovery is not configured.");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}
export function authOptions() {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL || !process.env.BETTER_AUTH_SECRET) throw new Error("Cloud recovery is not configured.");
  const origin = new URL(baseURL).origin;
  return {
    database: database(), baseURL, secret: process.env.BETTER_AUTH_SECRET,
    appName: "Drip", trustedOrigins: [origin],
    emailAndPassword: { enabled: true, minPasswordLength: 32, requireEmailVerification: false },
    // Identifiers are generated from high-entropy recovery codes, not real email addresses.
    user: { changeEmail: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" as const, window: 60, max: 30 },
    plugins: [passkey({ rpID: new URL(baseURL).hostname, rpName: "Drip", origin }), passwordLogin(database())],
  };
}
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
export function cloudConfigured() { return !!(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL); }
