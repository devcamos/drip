import { beforeEach, expect, it, vi } from "vitest";
import { DEVICE_LIMIT_MESSAGE, admitDeviceSession, assertDeviceAdmission, deviceSessionHooks, guardDeviceAuthResponse } from "../server/device-sessions";
import { withPasswordOwner } from "../server/password-transaction";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
type Row = { id: string; userId: string; dripDeviceId: string | null; active?: boolean };
function fixture(initial: Row[]) {
  const rows = [...initial]; const events: string[] = [];
  let queue = Promise.resolve();
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    events.push(sql);
    if (sql.startsWith('SELECT id, "dripDeviceId"')) return { rows: rows.filter(row => row.userId === params[0] && row.active !== false) };
    if (sql.startsWith('DELETE FROM "session"')) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const matches = sql.includes('"dripDeviceId" = $2') ? rows[i].userId === params[0] && rows[i].dripDeviceId === params[1] && rows[i].id !== params[2] : rows[i].id === params[0] && rows[i].userId === params[1];
        if (matches) rows.splice(i, 1);
      }
    }
    return { rows: [] };
  });
  const db = { query: execute, connect: vi.fn(async () => {
    let unlock: (() => void) | undefined;
    return { release: vi.fn(), query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("FOR NO KEY UPDATE")) {
        const previous = queue;
        queue = new Promise<void>(resolve => { unlock = resolve; });
        await previous;
      }
      const value = await execute(sql, params);
      if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
      return value;
    } };
  }) };
  return { rows, events, execute, db: db as any, hooks: deviceSessionHooks(db as any) };
}
const row = (id: string, device: string | null = null, active = true): Row => ({ id, userId: "owner", dripDeviceId: device, active });
beforeEach(() => vi.clearAllMocks());

it("sets only a valid public browser UUID, ignores missing legacy headers and rejects malformed identifiers", async () => {
  const { hooks } = fixture([]);
  expect(await hooks.session.create.before({}, { headers: new Headers({ "X-Drip-Device": first.toUpperCase() }) })).toEqual({ data: { dripDeviceId: first } });
  expect(await hooks.session.create.before({}, null)).toEqual({ data: { dripDeviceId: null } });
  await expect(hooks.session.create.before({}, { headers: new Headers({ "X-Drip-Device": "skip-this-device" }) })).rejects.toThrow(/Invalid browser identifier/);
});

it("counts legacy sessions separately, ignores expired sessions and rejects a third browser without evicting either signed-in browser", async () => {
  const f = fixture([row("old-1"), row("old-2"), row("expired", null, false), row("candidate", first)]);
  await expect(f.hooks.session.create.after({ id: "candidate", userId: "owner" }, { path: "/sign-in/email" })).rejects.toThrow(DEVICE_LIMIT_MESSAGE);
  expect(f.rows.map(item => item.id)).toEqual(["old-1", "old-2", "expired"]);
  expect(f.events.at(-1)).toBe("COMMIT");
  expect(f.events).not.toContain("ROLLBACK");
});

it("renews the same browser by rotating its previous sessions, retaining at most two active tokens", async () => {
  const f = fixture([row("old", first), row("other", second), row("candidate", first)]);
  await f.hooks.session.create.after({ id: "candidate", userId: "owner" }, { path: "/sign-in/email" });
  expect(f.rows.map(item => item.id)).toEqual(["other", "candidate"]);
});

it("does not rotate any session if the candidate was revoked or expired before admission", async () => {
  const f = fixture([row("old", first), row("candidate", first, false)]);
  await expect(f.hooks.session.create.after({ id: "candidate", userId: "owner" }, null)).rejects.toThrow(/Sign-in changed/);
  expect(f.rows).toEqual([row("old", first)]);
});

it("serializes simultaneous candidates and conservatively rejects pending candidates rather than exceeding two sessions", async () => {
  const f = fixture([row("old", first), row("candidate-a", second), row("candidate-b")]);
  const outcomes = await Promise.allSettled(["candidate-a", "candidate-b"].map(id => f.hooks.session.create.after({ id, userId: "owner" }, null)));
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(f.rows).toHaveLength(2);
});

it.each(["/sign-up/email", "/sign-in/email", "/passkey/verify-authentication", "/passkey/verify-registration", "/other-plugin-sign-in"])('covers session creation from %s', async path => {
  const f = fixture([row("one"), row("two"), row("candidate")]);
  await expect(f.hooks.session.create.after({ id: "candidate", userId: "owner" }, { path })).rejects.toMatchObject({ statusCode: 409, body: { code: "DEVICE_LIMIT_REACHED" } });
  expect(f.rows).toHaveLength(2);
});

it("defers only the exact custom password endpoint, retaining its owner-locked fresh credential recheck", async () => {
  const f = fixture([row("candidate")]);
  await f.hooks.session.create.after({ id: "candidate", userId: "owner" }, { path: "/sign-in/gamertag" });
  expect(f.db.connect).not.toHaveBeenCalled();
  const outcome = await withPasswordOwner(f.db, "owner", client => admitDeviceSession(client, { id: "candidate", userId: "owner" }));
  assertDeviceAdmission(outcome);
  expect(f.events.at(-1)).toBe("COMMIT");
});

it.each([false, true])("strips queued signup cookies and tokens after cap or database admission failure (database: %s)", async databaseFailure => {
  const f = fixture([row("one"), row("two"), row("candidate")]);
  if (databaseFailure) f.execute.mockRejectedValue(new Error("Database secret must not escape"));
  const response = await guardDeviceAuthResponse(async () => {
    const queued = Response.json({ token: "private-candidate-token" }, { headers: { "Set-Cookie": "session=private-cookie; HttpOnly" } });
    // Model the library retaining a response queued before its deferred hook.
    await f.hooks.session.create.after({ id: "candidate", userId: "owner" }, { path: "/sign-up/email" }).catch(() => undefined);
    return queued;
  });
  expect(response.status).toBe(databaseFailure ? 503 : 409);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.text()).not.toMatch(/private-|Database secret/);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("keeps successful cookies and fails closed when the auth handler throws before a response exists", async () => {
  const success = await guardDeviceAuthResponse(async () => Response.json({ token: "allowed" }, { headers: { "Set-Cookie": "allowed-cookie" } }));
  expect(success.headers.get("set-cookie")).toBe("allowed-cookie");
  const failure = await guardDeviceAuthResponse(async () => { throw new Error("database credentials"); });
  expect(failure.status).toBe(503); expect(failure.headers.has("set-cookie")).toBe(false);
  expect(await failure.text()).not.toContain("credentials");
});
