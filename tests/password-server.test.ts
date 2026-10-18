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
const db = { query: vi.fn() };
const proof = "a".repeat(43); const recoveryProof = "b".repeat(64);
function context(body: unknown) { return {
  body, headers: new Headers({ "x-drip-owner": "owner" }), setHeader: vi.fn(), json: (value: unknown) => value,
  context: { secret: "test-secret", session: { user: { id: "owner" }, session: { id: "current-session" } },
    password: { hash: vi.fn(async () => "library-hashed-proof"), verify: vi.fn(async () => true) },
    internalAdapter: { findUserById: vi.fn(async () => ({ id: "owner" })), findCredentialAccount: vi.fn(async () => ({ password: "hashed-recovery" })), createSession: vi.fn(async () => ({ id: "new-session" })) },
  },
}; }
const endpoints = passwordLogin(db as any).endpoints as any;
beforeEach(() => { vi.clearAllMocks(); db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : sql.includes("WITH saved") ? [{ user_id: "owner" }] : [] })); });
it("uses Better Auth password verification and cookie sessions before returning an encrypted wrapper", async () => {
  const envelope = await wrapPasswordRoot(fixtureCode, "tester", "Some password 123!", "owner");
  db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("drip_recovery_limits") ? [{ key: "login:global", hits: 1 }] : [{ user_id: "owner", password_hash: "hashed", envelope }] }));
  const ctx = context({ username: "tester", proof });
  expect(await endpoints.signInGamertag(ctx)).toEqual({ owner: "owner", envelope });
  expect(ctx.context.password.verify).toHaveBeenCalledWith({ hash: "hashed", password: proof });
  expect(cookie).toHaveBeenCalledWith(ctx, { user: { id: "owner" }, session: { id: "new-session" } });
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
