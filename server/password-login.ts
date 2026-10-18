import { createHmac } from "node:crypto";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { Pool } from "@neondatabase/serverless";
import * as z from "zod";
import { validPasswordWrap } from "../lib/password-crypto";

const username = z.string().regex(/^[a-z0-9_]{3,16}$/);
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const badLogin = () => new APIError("UNAUTHORIZED", { message: "Gamertag or password is incorrect." });
async function allowed(db: Pool, name: string, headers: Headers, secret: string) {
  const ip = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const { rows } = await db.query(`INSERT INTO drip_recovery_limits (key, bucket, hits) VALUES
    ('login:global', date_trunc('minute', now()), 1), ($1, date_trunc('minute', now()), 1), ($2, date_trunc('minute', now()), 1)
    ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN drip_recovery_limits.bucket = date_trunc('minute', now()) THEN drip_recovery_limits.hits + 1 ELSE 1 END,
    bucket = date_trunc('minute', now()) RETURNING key, hits`, [`login:name:${digest(name)}`, `login:ip:${digest(ip)}`]);
  if (rows.some(row => row.hits > (row.key === "login:global" ? 300 : 20))) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts. Try again in a minute." });
}

/** An additional Better Auth factor for the existing user, not a second account.
 * Better Auth hashes/verifies proofs and creates the ordinary signed session.
 * Keep the high-entropy recovery credential intact for recovery and old devices.
 */
export function passwordLogin(db: Pool) {
  return {
    id: "drip-gamertag-password",
    endpoints: {
      signInGamertag: createAuthEndpoint("/sign-in/gamertag", {
        method: "POST", requireHeaders: true, body: z.object({ username, proof }),
      }, async ctx => {
        await allowed(db, ctx.body.username, ctx.headers, ctx.context.secret);
        const { rows } = await db.query("SELECT user_id, password_hash, envelope FROM drip_password_login WHERE username = $1", [ctx.body.username]);
        const entry = rows[0];
        if (!entry) { await ctx.context.password.hash(ctx.body.proof); throw badLogin(); }
        if (!(await ctx.context.password.verify({ hash: entry.password_hash, password: ctx.body.proof }))) throw badLogin();
        const user = await ctx.context.internalAdapter.findUserById(entry.user_id);
        if (!user || !validPasswordWrap(entry.envelope) || entry.envelope.owner !== user.id || entry.envelope.username !== ctx.body.username) throw badLogin();
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not sign in. Try again." });
        await setSessionCookie(ctx, { user, session });
        ctx.setHeader("Cache-Control", "no-store");
        return ctx.json({ owner: user.id, envelope: entry.envelope });
      }),
      setGamertagPassword: createAuthEndpoint("/gamertag-password", {
        method: "POST", requireHeaders: true, use: [sessionMiddleware],
        body: z.object({ username, proof, recoveryProof: z.string().regex(/^[a-f0-9]{64}$/), envelope: z.unknown() }),
      }, async ctx => {
        const owner = ctx.context.session.user.id;
        if (ctx.headers.get("x-drip-owner") !== owner) throw new APIError("UNAUTHORIZED", { message: "Account changed. Sign in again." });
        await allowed(db, ctx.body.username, ctx.headers, ctx.context.secret);
        const account = await ctx.context.internalAdapter.findCredentialAccount(owner);
        if (!account?.password || !(await ctx.context.password.verify({ hash: account.password, password: ctx.body.recoveryProof }))) throw new APIError("UNAUTHORIZED", { message: "Verify your recovery code before setting a password." });
        const envelope = ctx.body.envelope;
        if (!validPasswordWrap(envelope) || envelope.owner !== owner || envelope.username !== ctx.body.username) throw new APIError("BAD_REQUEST", { message: "Invalid encrypted unlock key." });
        const safe = { app: envelope.app, v: envelope.v, username: envelope.username, owner, iter: envelope.iter, salt: envelope.salt, iv: envelope.iv, ct: envelope.ct };
        const hash = await ctx.context.password.hash(ctx.body.proof);
        try {
          // Keep this recovery-verified session; expire other cloud sessions.
          const saved = await db.query(`WITH saved AS (
            INSERT INTO drip_password_login (user_id, username, password_hash, envelope)
            SELECT $1, $2, $3, $4::jsonb WHERE EXISTS (SELECT 1 FROM drip_vault WHERE user_id = $1)
            ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, envelope = EXCLUDED.envelope, updated_at = now()
            RETURNING user_id
          ), revoked AS (DELETE FROM "session" WHERE "userId" = (SELECT user_id FROM saved) AND id <> $5 RETURNING id)
          SELECT user_id FROM saved`, [owner, ctx.body.username, hash, JSON.stringify(safe), ctx.context.session.session.id]);
          if (!saved.rows.length) throw new APIError("CONFLICT", { message: "Save your cloud copy before setting a password." });
        } catch (error) {
          if ((error as { code?: string }).code === "23505") throw new APIError("CONFLICT", { message: "That gamertag is already used for sign-in. Choose another." });
          throw error;
        }
        ctx.setHeader("Cache-Control", "no-store");
        return ctx.json({ username: ctx.body.username, saved: true });
      }),
    },
  };
}
