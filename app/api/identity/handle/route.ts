import { createHmac } from "node:crypto";
import * as z from "zod";
import { authBaseURL } from "../../../../scripts/deployment-config.mjs";
import { cloudConfigured, database, getAuth } from "@/server/auth";
import { isReservedHandle } from "@/lib/identity";
import { HandleReservationError, reserveHandle } from "@/server/handle-reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const requestBody = z.strictObject({ identityId: z.string().uuid(), handle: z.string().regex(/^[A-Za-z0-9_]{3,16}$/), mode: z.enum(["ensure", "rename"]).optional() });
async function bodyOf(request: Request) {
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 1024) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
async function allowed(userId: string, request: Request, isRename: boolean) {
  const secret = process.env.BETTER_AUTH_SECRET!;
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  // Background ensure calls are frequent and must not spend a user's rename
  // allowance. Keep their counters separate while retaining the shared IP cap.
  const keys = [`handle:user:${isRename ? "rename" : "ensure"}:${digest(userId)}`, `handle:ip:${digest(ip)}`];
  await database().query("DELETE FROM drip_handle_limits WHERE bucket < now() - interval '2 days'");
  const { rows } = await database().query(`INSERT INTO drip_handle_limits (key, bucket, hits) VALUES
    ($1, date_trunc('hour', now()), 1), ($2, date_trunc('hour', now()), 1)
    ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN drip_handle_limits.bucket = date_trunc('hour', now()) THEN drip_handle_limits.hits + 1 ELSE 1 END,
    bucket = date_trunc('hour', now()) RETURNING key, hits`, keys);
  // Four active devices may each check once a minute (240 requests/hour).
  // Allow normal sync headroom; explicit profile renames remain tightly capped.
  return rows.every((row) => row.hits <= (row.key === keys[0] ? (isRename ? 10 : 600) : 300));
}

export async function POST(request: Request) {
  const base = authBaseURL(process.env);
  if (!base || request.headers.get("origin") !== new URL(base).origin) return reply({ error: "Invalid origin." }, 403);
  if (!cloudConfigured()) return reply({ error: "Gamertag service is unavailable." }, 503);
  const userId = (await getAuth().api.getSession({ headers: request.headers }))?.user.id;
  if (!userId) return reply({ error: "Sign in to reserve your profile gamertag." }, 401);
  const parsed = requestBody.safeParse(await bodyOf(request));
  if (!parsed.success) return reply({ error: "Enter a gamertag with 3–16 letters, numbers or underscores." }, 400);
  if (isReservedHandle(parsed.data.handle)) return reply({ error: "That gamertag is reserved. Choose another." }, 400);
  try {
    if (!(await allowed(userId, request, parsed.data.mode === "rename"))) return reply({ error: "Too many gamertag changes. Try again later." }, 429);
    return reply(await reserveHandle(database(), parsed.data.identityId, userId, parsed.data.handle, parsed.data.mode === "rename"));
  } catch (error) {
    if (error instanceof HandleReservationError) {
      if (error.code === "IDENTITY_OWNED") return reply({ error: "This profile belongs to a different account. Sign in to its original account." }, 409);
      if (error.code === "ACCOUNT_ALREADY_HAS_IDENTITY") return reply({ error: "This account already has a different Drip profile." }, 409);
      return reply({ error: "Could not reserve that gamertag. Try again." }, 503);
    }
    return reply({ error: "Gamertag service is unavailable. Your local account is safe; try again shortly." }, 503);
  }
}
