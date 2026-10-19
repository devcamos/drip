import { beforeEach, expect, it, vi } from "vitest";
const cookie = vi.hoisted(() => vi.fn());
vi.mock("better-auth/cookies", () => ({ setSessionCookie: cookie }));
vi.mock("better-auth/api", async importOriginal => {
  const original = await importOriginal<typeof import("better-auth/api")>();
  return { ...original, createAuthEndpoint: (_path: string, _options: unknown, handler: unknown) => handler };
});
import { passwordLogin } from "../server/password-login";
import { wrapPasswordRoot } from "../lib/password-crypto";
import { fixtureCode } from "./storage-fixtures";
const client = { query: vi.fn(), release: vi.fn() };
const db = { query: vi.fn(), connect: vi.fn(async () => client) };
const proof = "a".repeat(43); const recoveryProof = "b".repeat(64);
function context(body: unknown) { return {
  body, headers: new Headers({ "x-drip-owner": "owner" }), setHeader: vi.fn(), json: (value: unknown) => value,
  context: { secret: "test-secret", session: { user: { id: "owner" }, session: { id: "current-session" } },
    password: { hash: vi.fn(async () => "library-hashed-proof"), verify: vi.fn(async () => true) },
    internalAdapter: { findUserById: vi.fn(async () => ({ id: "owner" })), findCredentialAccount: vi.fn(async () => ({ password: "hashed-recovery" })), createSession: vi.fn(async () => ({ id: "new-session", token: "new-token" })), deleteSession: vi.fn(async (_token: string) => {}) },
  },
}; }
const endpoints = passwordLogin(db as any).endpoints as any;
beforeEach(() => { vi.clearAllMocks(); client.query.mockImplementation((...args) => db.query(...args)); db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : sql.includes("WITH saved") ? [{ user_id: "owner" }] : [] })); });
it("uses Better Auth password verification and cookie sessions before returning an encrypted wrapper", async () => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "owner");
  db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : [{ user_id: "owner", password_hash: "hashed", envelope }] }));
  const ctx = context({ username: "tester", proof });
  expect(await endpoints.signInGamertag(ctx)).toEqual({ owner: "owner", envelope });
  expect(ctx.context.password.verify).toHaveBeenCalledWith({ hash: "hashed", password: proof });
  expect(cookie).toHaveBeenCalledWith(ctx, { user: { id: "owner" }, session: { id: "new-session", token: "new-token" } });
  expect(ctx.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});
it("returns the same failure for unknown users and wrong passwords, with dummy hashing for unknown names", async () => {
  const unknown = context({ username: "tester", proof });
  await expect(endpoints.signInGamertag(unknown)).rejects.toThrow(/Gamertag or password is incorrect/);
  expect(unknown.context.password.hash).toHaveBeenCalledWith(proof); expect(cookie).not.toHaveBeenCalled();
  db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : [{ user_id: "owner", password_hash: "hashed" }] }));
  const wrong = context({ username: "tester", proof }); wrong.context.password.verify.mockResolvedValue(false);
  await expect(endpoints.signInGamertag(wrong)).rejects.toThrow(/Gamertag or password is incorrect/); expect(cookie).not.toHaveBeenCalled();
});
it("requires proof of the recovery credential and owner before creating or resetting password login", async () => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "owner");
  const ctx = context({ username: "tester", proof, recoveryProof, envelope: { ...envelope, unknown: "must-not-store" } });
  await endpoints.setGamertagPassword(ctx);
  expect(ctx.context.password.verify).toHaveBeenCalledWith({ hash: "hashed-recovery", password: recoveryProof });
  expect(ctx.context.password.hash).toHaveBeenCalledWith(proof);
  const write = db.query.mock.calls.find(call => call[0].includes("WITH saved"))!;
  expect(write[1]).toEqual(["owner", "tester", "library-hashed-proof", JSON.stringify(envelope), "current-session"]);
  const bad = context(ctx.body); bad.context.password.verify.mockResolvedValue(false);
  await expect(endpoints.setGamertagPassword(bad)).rejects.toThrow(/Verify your recovery code/);
  bad.headers.set("x-drip-owner", "other");
  await expect(endpoints.setGamertagPassword(bad)).rejects.toThrow(/Account changed/);
  expect(cookie).not.toHaveBeenCalled();
});
it("enforces durable login limits and rejects ciphertext for another user", async () => {
  const ctx = context({ username: "tester", proof });
  db.query.mockResolvedValueOnce({ rows: [{ key: "login:global", hits: 301 }] });
  await expect(endpoints.signInGamertag(ctx)).rejects.toThrow(/Too many/);
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "other");
  await expect(endpoints.setGamertagPassword(context({ username: "tester", proof, recoveryProof, envelope }))).rejects.toThrow(/Invalid encrypted/);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
it.each(["verification", "session creation"])("rejects an old-password login when reset commits during %s", async stage => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "owner");
  let credential = "old-hash";
  const sessions = new Set(["current-session", "previous-session"]);
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("drip_recovery_limits")) return { rows: [{ key: "login:global", hits: 1 }] };
    if (sql.includes("SELECT user_id, password_hash")) return { rows: [{ user_id: "owner", password_hash: credential, envelope }] };
    if (sql.includes("WITH saved")) {
      credential = String(params[2]);
      for (const id of sessions) if (id !== params[4]) sessions.delete(id);
      return { rows: [{ user_id: "owner" }] };
    }
    if (sql.includes("JOIN \"session\"")) return { rows: credential === params[2] && sessions.has(String(params[3])) ? [{ user_id: "owner" }] : [] };
    if (sql.startsWith('DELETE FROM "session"')) sessions.delete(String(params[0]));
    return { rows: [] };
  });
  const paused = deferred(), resume = deferred();
  const login = context({ username: "tester", proof });
  login.context.password.verify.mockImplementation(async () => {
    if (stage === "verification") { paused.resolve(); await resume.promise; }
    return true;
  });
  login.context.internalAdapter.createSession.mockImplementation(async () => {
    sessions.add("new-session");
    if (stage === "session creation") { paused.resolve(); await resume.promise; }
    return { id: "new-session", token: "new-token" };
  });
  const pending = endpoints.signInGamertag(login);
  await paused.promise;
  await endpoints.setGamertagPassword(context({ username: "tester", proof: "z".repeat(43), recoveryProof, envelope }));
  resume.resolve();
  await expect(pending).rejects.toThrow(/Gamertag or password is incorrect/);
  expect(sessions).toEqual(new Set(["current-session"]));
  expect(cookie).not.toHaveBeenCalled();
});
it.each([false, true])("does not publish a candidate session after database verification fails (cleanup failure: %s)", async cleanupFails => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "owner");
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('JOIN "session"')) throw new Error("Database unavailable");
    return { rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : [{ user_id: "owner", password_hash: "hashed", envelope }] };
  });
  const ctx = context({ username: "tester", proof });
  if (cleanupFails) ctx.context.internalAdapter.deleteSession.mockRejectedValueOnce(new Error("Cleanup unavailable"));
  await expect(endpoints.signInGamertag(ctx)).rejects.toThrow("Database unavailable");
  expect(ctx.context.internalAdapter.deleteSession).toHaveBeenCalledWith("new-token");
  expect(cookie).not.toHaveBeenCalled();
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  expect(client.release).toHaveBeenCalledWith(false);
});
