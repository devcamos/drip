import { expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { deviceSessionHooks, guardDeviceAuthResponse } from "../server/device-sessions";
import { withApiErrors } from "../server/http-errors";

const guardedRequest = (work: () => Promise<Response>) => withApiErrors("auth", () => guardDeviceAuthResponse(work), { code: "AUTH_UNAVAILABLE", message: "Could not complete sign-in. Try again shortly." });

it("applies the cap to real email sign-ins and renews a browser without adding a third token", async () => {
  const memory: Record<string, Record<string, any>[]> = { user: [], session: [], account: [], verification: [] };
  const client = { release() {}, async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('SELECT id, "dripDeviceId"')) return { rows: memory.session.filter(row => row.userId === params[0] && new Date(row.expiresAt).getTime() > Date.now()) };
    if (sql.startsWith('DELETE FROM "session"')) {
      for (let index = memory.session.length - 1; index >= 0; index--) {
        const row = memory.session[index];
        const matches = sql.includes('"dripDeviceId" = $2') ? row.userId === params[0] && row.dripDeviceId === params[1] && row.id !== params[2] : row.id === params[0] && row.userId === params[1];
        if (matches) memory.session.splice(index, 1);
      }
    }
    return { rows: [] };
  } };
  const db = { connect: async () => client, query: client.query } as any;
  const origin = "http://localhost:4321";
  const auth = betterAuth({
    baseURL: origin, secret: "Synthetic-only-auth-test-secret-42!", database: memoryAdapter(memory), trustedOrigins: [origin],
    emailAndPassword: { enabled: true }, databaseHooks: deviceSessionHooks(db),
    session: { additionalFields: { dripDeviceId: { type: "string", input: false, returned: false, required: false } } },
  });
  const send = (path: string, device: string) => guardedRequest(() => auth.handler(new Request(origin + "/api/auth/" + path, {
    method: "POST", headers: { origin, "Content-Type": "application/json", "X-Drip-Device": device },
    body: JSON.stringify({ email: "synthetic@recovery.drip.invalid", password: "Synthetic-password-only-42!", name: "Synthetic" }),
  })));
  const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222", third = "33333333-3333-4333-8333-333333333333";
  const created = await send("sign-up/email", first);
  expect(created.status).toBe(200); expect(created.headers.getSetCookie().length).toBeGreaterThan(0);
  expect(created.headers.get("x-drip-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  expect((await send("sign-in/email", second)).status).toBe(200);
  const previous = memory.session.find(row => row.dripDeviceId === first)!.token;
  const denied = await send("sign-in/email", third);
  expect(denied.status).toBe(409); expect(denied.headers.has("set-cookie")).toBe(false);
  expect((await denied.json()).code).toBe("DEVICE_LIMIT_REACHED"); expect(memory.session).toHaveLength(2);
  expect((await send("sign-in/email", first)).status).toBe(200);
  expect(memory.session).toHaveLength(2); expect(memory.session.some(row => row.token === previous)).toBe(false);
});

it.each(["limit", "database"])("does not expose a signup cookie/token after a real Better Auth deferred-hook %s failure", async mode => {
  // Exercise the actual library's signup transaction/cookie ordering using only
  // synthetic in-memory auth data. The cap queries remain an isolated SQL fake.
  const sqlRows: { id: string; dripDeviceId: null }[] = [];
  const client = { release() {}, async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('SELECT id, "dripDeviceId"')) {
      if (mode === "database") throw new Error("synthetic database outage");
      return { rows: [...sqlRows] };
    }
    if (sql.startsWith('DELETE FROM "session"')) {
      const index = sqlRows.findIndex(row => row.id === params[0]); if (index >= 0) sqlRows.splice(index, 1);
    }
    return { rows: [] };
  } };
  const db = { connect: async () => client, query: client.query } as any;
  const hooks = deviceSessionHooks(db);
  const memory = { user: [], session: [], account: [], verification: [] };
  const origin = "http://localhost:4321";
  const auth = betterAuth({
    baseURL: origin, secret: "Synthetic-only-auth-test-secret-42!", database: memoryAdapter(memory),
    trustedOrigins: [origin], emailAndPassword: { enabled: true },
    session: { additionalFields: { dripDeviceId: { type: "string", input: false, returned: false, required: false } } },
    databaseHooks: { session: { create: {
      before: hooks.session.create.before,
      after: async (session, context) => {
        sqlRows.push({ id: "legacy-one", dripDeviceId: null }, { id: "legacy-two", dripDeviceId: null }, { id: session.id, dripDeviceId: null });
        await hooks.session.create.after(session, context);
      },
    } } },
  });
  const response = await guardedRequest(() => auth.handler(new Request(origin + "/api/auth/sign-up/email", {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "synthetic@recovery.drip.invalid", password: "Synthetic-password-only-42!", name: "Synthetic" }),
  })));
  expect(response.status).toBe(mode === "limit" ? 409 : 503);
  expect(response.headers.has("set-cookie")).toBe(false);
  const value = await response.json();
  expect(value.code).toBe(mode === "limit" ? "DEVICE_LIMIT_REACHED" : "DEVICE_ADMISSION_UNAVAILABLE");
  expect(value).not.toHaveProperty("token");
  expect(sqlRows.map(row => row.id)).toEqual(["legacy-one", "legacy-two"]);
});
