import { getMigrations } from "better-auth/db/migration";
import { passkey } from "@better-auth/passkey";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) throw new Error("Configure the target environment before migrating.");
neonConfig.webSocketConstructor = process.env.HTTPS_PROXY
  ? class extends WebSocket { constructor(address, protocols) { super(address, protocols, { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }); } }
  : WebSocket;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const options = {
  database: db, secret: process.env.BETTER_AUTH_SECRET, baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true }, rateLimit: { enabled: true, storage: "database" }, plugins: [passkey()],
  session: { additionalFields: { dripDeviceId: { type: "string", required: false, input: false, returned: false } } },
};
const migration = await getMigrations(options);
await migration.runMigrations();
await db.query('ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "dripDeviceId" text');
await db.query(`CREATE TABLE IF NOT EXISTS drip_vault (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0), envelope jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`);
await db.query(`CREATE TABLE IF NOT EXISTS drip_vault_limits (user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, bucket timestamptz NOT NULL, hits integer NOT NULL)`);
await db.query(`CREATE TABLE IF NOT EXISTS drip_recovery_codes (user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, records jsonb NOT NULL)`);
await db.query(`CREATE INDEX IF NOT EXISTS drip_recovery_codes_lookup ON drip_recovery_codes USING gin (records jsonb_path_ops)`);
await db.query(`CREATE TABLE IF NOT EXISTS drip_recovery_limits (key text PRIMARY KEY, bucket timestamptz NOT NULL, hits integer NOT NULL)`);
await db.query(`CREATE TABLE IF NOT EXISTS drip_password_login (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,16}$'),
  password_hash text NOT NULL, envelope jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`);
await db.end();
console.log("Auth and encrypted vault schema ready.");
