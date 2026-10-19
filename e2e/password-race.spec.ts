import { test, expect } from "@playwright/test";
import type { Pool } from "@neondatabase/serverless";
import { getAuth, database } from "../server/auth";
import { withPasswordOwner } from "../server/password-transaction";
import { generateRecoveryCode } from "../lib/crypto";
import { recoveryCredentials } from "../lib/cloud";
import { passwordProof, wrapPasswordRoot } from "../lib/password-crypto";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
test("database-coordinated reset rejects overlapping password logins and sees sessions created while waiting", async () => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database; ordinary CI runs deterministic server regressions.");
  test.setTimeout(180_000);
  process.loadEnvFile(".env.local");
  if (new URL(process.env.DATABASE_URL!).hostname !== "ep-spring-band-b8noxum4-pooler.c-14.us-east-1.aws.neon.tech" || process.env.BETTER_AUTH_URL !== "http://localhost:4321") throw new Error("Use the isolated Preview database and local auth origin for this test.");
  const auth = getAuth(), db = database(), authContext = await auth.$context;
  const origin = process.env.BETTER_AUTH_URL;
  const root = generateRecoveryCode(), recovery = await recoveryCredentials(root);
  const username = "race_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const verify = authContext.password.verify;
  const createSession = authContext.internalAdapter.createSession;
  let owner: string | undefined;
  const releases: (() => void)[] = [];
  const background: Promise<unknown>[] = [];
  async function post(path: string, body: unknown, cookie?: string, account?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { origin: origin!, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(account ? { "x-drip-owner": account } : {}) }, body: JSON.stringify(body) }));
      if (response.status !== 429 || attempt === 2) return response;
      const seconds = Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after") ?? 60);
      expect(seconds > 0 && seconds <= 60).toBe(true);
      // Respect the actual auth limit; do not disable it for fixture requests.
      await new Promise(done => setTimeout(done, seconds * 1000 + 100));
    }
    throw new Error("Sign-in retry budget exhausted.");
  }
  try {
    const signup = await post("sign-up/email", { ...recovery, name: username });
    expect(signup.status).toBe(200);
    owner = (await signup.json()).user.id;
    const cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    // Auth-only fixture: a synthetic encrypted-row prerequisite, not user money.
    await db.query("INSERT INTO drip_vault (user_id, version, envelope) VALUES ($1, 1, $2::jsonb)", [owner, JSON.stringify({ app: "drip-cloud", v: 1, iv: "synthetic", ct: "synthetic" })]);
    let password = "First river password 42!";
    const setPassword = async (value: string) => post("gamertag-password", { username, proof: await passwordProof(username, value), recoveryProof: recovery.password, envelope: await wrapPasswordRoot(root, username, value, owner!) }, cookie, owner);
    expect((await setPassword(password)).status).toBe(200);
    for (const stage of ["verification", "session creation"]) {
      const paused = signal(), resume = signal(); releases.push(resume.resolve);
      const oldProof = await passwordProof(username, password); let armed = true;
      authContext.password.verify = async args => {
        const valid = await verify(args);
        if (stage === "verification" && armed && args.password === oldProof) { armed = false; paused.resolve(); await resume.promise; }
        return valid;
      };
      authContext.internalAdapter.createSession = async (...args) => {
        const session = await createSession(...args);
        if (stage === "session creation" && armed && args[0] === owner) { armed = false; paused.resolve(); await resume.promise; }
        return session;
      };
      const pending = post("sign-in/gamertag", { username, proof: oldProof });
      background.push(pending);
      await Promise.race([paused.promise, pending.then(() => { throw new Error("Login finished before the overlap barrier."); })]);
      password = stage === "verification" ? "Second river password 53!" : "Third river password 64!";
      try { expect((await setPassword(password)).status).toBe(200); }
      finally { resume.resolve(); }
      const rejected = await pending;
      expect(rejected.status).toBe(401);
      expect(rejected.headers.getSetCookie().some(value => value.includes("session_token="))).toBe(false);
      expect((await db.query('SELECT count(*)::int AS count FROM "session" WHERE "userId" = $1', [owner])).rows[0].count).toBe(1);
      authContext.password.verify = verify; authContext.internalAdapter.createSession = createSession;
    }
    const held = signal(), unlock = signal(), waiting = signal(); releases.push(unlock.resolve);
    const holder = withPasswordOwner(db, owner!, async () => { held.resolve(); await unlock.promise; });
    background.push(holder);
    await held.promise;
    const observedPool = { connect: async () => {
      const client = await db.connect();
      return { query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("FOR NO KEY UPDATE")) waiting.resolve();
        return client.query(sql, params);
      }, release: (broken: boolean) => client.release(broken) };
    } } as Pool;
    let entered = false;
    const waiter = withPasswordOwner(observedPool, owner!, async client => {
      entered = true;
      return (await client.query('SELECT id FROM "session" WHERE id = $1 AND "userId" = $2', [candidate!.id, owner])).rows.length;
    });
    background.push(waiter);
    await waiting.promise;
    expect(entered).toBe(false);
    // This uses the third pool connection; the lock must permit its FK check.
    const candidate = await createSession(owner!);
    unlock.resolve();
    await holder;
    expect(await waiter).toBe(1);
    expect((await setPassword(password)).status).toBe(200);
    const accepted = await post("sign-in/gamertag", { username, proof: await passwordProof(username, password) });
    expect(accepted.status).toBe(200);
    expect(accepted.headers.getSetCookie().some(value => value.includes("session_token="))).toBe(true);
  } finally {
    for (const release of releases) release();
    await Promise.allSettled(background);
    authContext.password.verify = verify; authContext.internalAdapter.createSession = createSession;
    if (owner) await db.query('DELETE FROM "user" WHERE id = $1 AND email = $2', [owner, recovery.email]);
    await db.end();
  }
});
