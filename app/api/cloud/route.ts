import { cloudConfigured, database, getAuth } from "@/server/auth";
import { isCloudEnvelope, MAX_CLOUD_BYTES } from "@/server/cloud-store";
import { withApiErrors } from "@/server/http-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function owner(request: Request) {
  if (!cloudConfigured()) return null;
  const id = (await getAuth().api.getSession({ headers: request.headers }))?.user.id;
  return id && request.headers.get("x-drip-owner") === id ? id : null;
}
async function allowed(id: string) {
  const { rows } = await database().query(`INSERT INTO drip_vault_limits (user_id, bucket, hits) VALUES ($1, date_trunc('minute', now()), 1)
    ON CONFLICT (user_id) DO UPDATE SET
      hits = CASE WHEN drip_vault_limits.bucket = date_trunc('minute', now()) THEN drip_vault_limits.hits + 1 ELSE 1 END,
      bucket = date_trunc('minute', now()) RETURNING hits`, [id]);
  return rows[0].hits <= 60;
}
async function read(request: Request) {
  const id = await owner(request);
  if (!id) return reply({ error: "Sign in to access your cloud copy." }, 401);
  if (!(await allowed(id))) return reply({ error: "Too many sync requests. Try again shortly." }, 429);
  const { rows } = await database().query('SELECT version, envelope, updated_at FROM drip_vault WHERE user_id = $1', [id]);
  return reply(rows[0] ?? { version: 0, envelope: null });
}
async function write(request: Request) {
  // Same-origin writes only, before parsing or touching the authenticated vault.
  if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL ?? request.url).origin) return reply({ error: "Invalid origin." }, 403);
  const id = await owner(request);
  if (!id) return reply({ error: "Sign in to save your cloud copy." }, 401);
  if (!(await allowed(id))) return reply({ error: "Too many sync requests. Try again shortly." }, 429);
  if (Number(request.headers.get("content-length")) > MAX_CLOUD_BYTES + 1024) return reply({ error: "Cloud copy is too large." }, 413);
  // Limit the stream as well: Content-Length is untrusted and can be omitted.
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "Missing body." }, 400);
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_CLOUD_BYTES + 1024) { await reader.cancel(); return reply({ error: "Cloud copy is too large." }, 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ error: "Invalid body." }, 400); }
  if (!body || typeof body !== "object" || !Number.isSafeInteger(body.version) || body.version < 0 || !isCloudEnvelope(body.envelope)) return reply({ error: "Invalid encrypted copy." }, 400);
  const { rows } = await database().query(`WITH updated AS (
    UPDATE drip_vault SET version = version + 1, envelope = $2, updated_at = now()
    WHERE user_id = $1 AND version = $3 RETURNING version, updated_at
  ), inserted AS (
    INSERT INTO drip_vault (user_id, version, envelope) SELECT $1, 1, $2 WHERE $3 = 0
    ON CONFLICT (user_id) DO NOTHING RETURNING version, updated_at
  ) SELECT * FROM updated UNION ALL SELECT * FROM inserted`, [id, JSON.stringify(body.envelope), body.version]);
  if (!rows.length) return reply({ error: "Cloud copy changed on another device. Restore it before saving again." }, 409);
  return reply(rows[0]);
}
const fallback = { code: "CLOUD_UNAVAILABLE", message: "Cloud is unavailable. Try again shortly." };
export const GET = (request: Request) => withApiErrors("cloud", () => read(request), fallback);
export const PUT = (request: Request) => withApiErrors("cloud", () => write(request), fallback);
