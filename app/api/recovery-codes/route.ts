import { createHmac } from "node:crypto";
import { cloudConfigured, database, getAuth } from "@/server/auth";
import { withApiErrors } from "@/server/http-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validLocator = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
async function bodyOf(request: Request) {
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 12_000) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
const sameOrigin = (request: Request) => request.headers.get("origin") === new URL(process.env.BETTER_AUTH_URL ?? request.url).origin;
async function allowed(request: Request) {
  // Vercel overwrites this header. Never trust arbitrary forwarded IPs on other hosts.
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const key = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(address).digest("hex");
  const { rows } = await database().query(`INSERT INTO drip_recovery_limits (key, bucket, hits) VALUES ('global', date_trunc('minute', now()), 1), ($1, date_trunc('minute', now()), 1)
    ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN drip_recovery_limits.bucket = date_trunc('minute', now()) THEN drip_recovery_limits.hits + 1 ELSE 1 END,
    bucket = date_trunc('minute', now()) RETURNING key, hits`, [key]);
  return rows.every(row => row.hits <= (row.key === "global" ? 300 : 30));
}
// Public lookup reveals only an encrypted root wrapper, never account data or a usable login secret.
// Locator has the entropy of a random 24-character code; raw codes are never sent to the server.
async function lookup(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  if (!cloudConfigured()) return reply({ error: "Recovery unavailable." }, 503);
  if (!(await allowed(request))) return reply({ error: "Too many recovery requests. Try again shortly." }, 429);
  const body = await bodyOf(request);
  if (!validLocator(body?.locator)) return reply({ error: "Invalid request." }, 400);
  const { rows } = await database().query(`SELECT item->'envelope' AS envelope FROM drip_recovery_codes, jsonb_array_elements(records) AS item
    WHERE records @> $1::jsonb AND item->>'locator' = $2 LIMIT 1`, [JSON.stringify([{ locator: body.locator }]), body.locator]);
  return rows.length ? reply(rows[0]) : reply({ error: "Code not found." }, 404);
}
async function status(request: Request) {
  if (!cloudConfigured()) return reply({ error: "Recovery unavailable." }, 503);
  const userId = (await getAuth().api.getSession({ headers: request.headers }))?.user.id;
  if (!userId || request.headers.get("x-drip-owner") !== userId) return reply({ error: "Sign in again." }, 401);
  const { rows } = await database().query("SELECT records FROM drip_recovery_codes WHERE user_id = $1", [userId]);
  return reply({ locators: rows.length ? rows[0].records.map((record: { locator: string }) => record.locator) : null });
}
async function rotate(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  if (!cloudConfigured()) return reply({ error: "Recovery unavailable." }, 503);
  const userId = (await getAuth().api.getSession({ headers: request.headers }))?.user.id;
  if (!userId || request.headers.get("x-drip-owner") !== userId) return reply({ error: "Sign in again." }, 401);
  if (!(await allowed(request))) return reply({ error: "Too many recovery requests. Try again shortly." }, 429);
  const body = await bodyOf(request); const records = body?.records;
  if (!Array.isArray(records) || records.length !== 6 || new Set(records.map(r => r?.locator)).size !== 6 || !records.every(r => {
    const e = r?.envelope;
    return validLocator(r?.locator) && e?.app === "drip" && e.v === 1 && e.kdf === "PBKDF2-SHA256" && e.iter === 600_000 &&
      typeof e.salt === "string" && /^[A-Za-z0-9+/]{22}==$/.test(e.salt) && typeof e.iv === "string" && /^[A-Za-z0-9+/]{16}$/.test(e.iv) &&
      typeof e.ct === "string" && e.ct.length >= 32 && e.ct.length <= 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(e.ct);
  })) return reply({ error: "Invalid recovery codes." }, 400);
  // The first set is permanent. The unique owner key also protects concurrent
  // tabs/devices and older clients: no request may replace an existing set.
  // Do not accept unbounded extra properties from clients.
  const safe = records.map(({ locator, envelope }) => ({ locator, envelope: { app: envelope.app, v: envelope.v, kdf: envelope.kdf, iter: envelope.iter, salt: envelope.salt, iv: envelope.iv, ct: envelope.ct } }));
  const { rows } = await database().query(`INSERT INTO drip_recovery_codes (user_id, records) SELECT $1, $2::jsonb WHERE EXISTS (SELECT 1 FROM drip_vault WHERE user_id = $1)
    ON CONFLICT (user_id) DO NOTHING RETURNING user_id`, [userId, JSON.stringify(safe)]);
  if (rows.length) return reply({ saved: true });
  const existing = await database().query("SELECT records FROM drip_recovery_codes WHERE user_id = $1", [userId]);
  if (!existing.rows.length) return reply({ error: "Save your cloud copy first." }, 409);
  const original = new Set(existing.rows[0].records.map((record: { locator: string }) => record.locator));
  // A lost response can safely be retried with the same original codes. Random
  // encryption IVs need not match; the immutable stored wrappers are retained.
  if (original.size === 6 && safe.every(record => original.has(record.locator))) return reply({ saved: true });
  return reply({ error: "Your original recovery codes are already set up. Use your saved recovery file; another set cannot be created.", code: "RECOVERY_CODES_EXIST" }, 409);
}
const fallback = { code: "RECOVERY_UNAVAILABLE", message: "Recovery is unavailable. Try again shortly." };
export const GET = (request: Request) => withApiErrors("recovery", () => status(request), fallback, request);
export const POST = (request: Request) => withApiErrors("recovery", () => lookup(request), fallback, request);
export const PUT = (request: Request) => withApiErrors("recovery", () => rotate(request), fallback, request);
