import { beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ user: "owner" as string | null, configured: true, query: vi.fn() }));
vi.mock("../server/auth", () => ({ cloudConfigured: () => backend.configured, getAuth: () => ({ api: { getSession: async () => backend.user ? { user: { id: backend.user } } : null } }), database: () => ({ query: backend.query }) }));
import { POST, PUT } from "../app/api/recovery-codes/route";
const origin = "http://localhost:4321";
const envelope = { app: "drip", v: 1, kdf: "PBKDF2-SHA256", iter: 600_000, salt: "AAAAAAAAAAAAAAAAAAAAAA==", iv: "AAAAAAAAAAAAAAAA", ct: "A".repeat(128) };
const records = Array.from({ length: 6 }, (_, i) => ({ locator: String(i).repeat(64), envelope }));
const request = (method: string, body?: unknown, extra = {}) => new Request(origin + "/api/recovery-codes", { method, headers: { origin, "X-Drip-Owner": "owner", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(() => {
  backend.user = "owner"; backend.configured = true;
  backend.query.mockReset().mockImplementation(async (sql: string) => sql.includes("drip_recovery_limits") ? { rows: [{ key: "ip", hits: 1 }, { key: "global", hits: 1 }] } : { rows: [] });
  vi.stubEnv("BETTER_AUTH_URL", origin); vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret");
});
describe("recovery wrapper API", () => {
  it("requires same-origin requests, configured storage and owner-bound session for rotation", async () => {
    expect((await POST(request("POST", {}, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await PUT(request("PUT", {}, { origin: "https://evil.example" }))).status).toBe(403);
    backend.configured = false;
    expect((await POST(request("POST", {}))).status).toBe(503);
    expect((await PUT(request("PUT", {}))).status).toBe(503);
    backend.configured = true; backend.user = null;
    expect((await PUT(request("PUT", { records }))).status).toBe(401);
    backend.user = "someone-else";
    expect((await PUT(request("PUT", { records }))).status).toBe(401);
    expect(backend.query).not.toHaveBeenCalled();
  });
  it("requires exactly six distinct valid encrypted wrappers and bounds all request bodies", async () => {
    for (const invalid of [null, {}, { records: [] }, { records: records.slice(1) }, { records: Array(6).fill(records[0]) }, { records: records.map(r => ({ ...r, envelope: { ...envelope, iter: 1_000_000_000 } })) }]) {
      expect((await PUT(request("PUT", invalid))).status).toBe(400);
    }
    expect((await POST(request("POST", { locator: "bad" }))).status).toBe(400);
    expect((await POST(request("POST"))).status).toBe(400);
    expect((await POST(new Request(origin + "/api/recovery-codes", { method: "POST", headers: { origin }, body: "invalid" }))).status).toBe(400);
    expect((await POST(request("POST", "A".repeat(13_000)))).status).toBe(400);
    expect((await PUT(request("PUT", { records }))).status).toBe(409);
    backend.query.mockImplementation(async (sql: string) => sql.includes("drip_recovery_limits") ? { rows: [{ key: "ip", hits: 1 }] } : { rows: [{ user_id: "owner" }] });
    expect((await PUT(request("PUT", { records }))).status).toBe(200);
    expect(backend.query).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT (user_id) DO UPDATE"), ["owner", JSON.stringify(records)]);
  });
  it("exposes only an encrypted wrapper for its hashed locator, with no-store and abuse limits", async () => {
    expect((await POST(request("POST", { locator: records[0].locator }))).status).toBe(404);
    backend.query.mockImplementation(async (sql: string) => sql.includes("drip_recovery_limits") ? { rows: [{ key: "ip", hits: 1 }] } : { rows: [{ envelope }] });
    const response = await POST(request("POST", { locator: records[0].locator }));
    expect(await response.json()).toEqual({ envelope });
    expect(response.headers.get("cache-control")).toBe("no-store");
    backend.query.mockResolvedValue({ rows: [{ key: "ip", hits: 31 }] });
    expect((await POST(request("POST", { locator: records[0].locator }))).status).toBe(429);
    expect((await PUT(request("PUT", { records }))).status).toBe(429);
    vi.stubEnv("VERCEL", "1"); backend.query.mockResolvedValue({ rows: [{ key: "global", hits: 301 }] });
    expect((await POST(request("POST", { locator: records[0].locator }, { "x-vercel-forwarded-for": "192.0.2.1" }))).status).toBe(429);
  });
});
