import { beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ configured: true, user: "owner-1" as string | null, query: vi.fn(), handler: vi.fn() }));
vi.mock("../server/auth", () => ({ cloudConfigured: () => backend.configured, getAuth: () => ({ handler: backend.handler, api: { getSession: async () => backend.user ? { user: { id: backend.user } } : null } }), database: () => ({ query: backend.query }) }));
import { GET, PUT } from "../app/api/cloud/route";
import { GET as status } from "../app/api/cloud/status/route";
import { isCloudEnvelope } from "../server/cloud-store";
import { POST as authHandler } from "../app/api/auth/[...all]/route";
const origin = "http://localhost:4321";
const envelope = { app: "drip-cloud", v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "A".repeat(32) };
const put = (body: unknown, headers: Record<string, string> = { origin, "Content-Type": "application/json", "X-Drip-Owner": "owner-1" }) => new Request(origin + "/api/cloud", { method: "PUT", headers, body: JSON.stringify(body) });
beforeEach(() => {
  backend.configured = true; backend.user = "owner-1"; backend.query.mockReset();
  backend.handler.mockReset().mockResolvedValue(Response.json({ ok: true }));
  backend.query.mockImplementation(async (sql: string) => sql.includes("drip_vault_limits") ? { rows: [{ hits: 1 }] } : { rows: [] });
  vi.stubEnv("BETTER_AUTH_URL", origin);
});
describe("vault authorization and version contract", () => {
  it("binds passkey registration to the connected owner, not a newly switched session", async () => {
    const request = new Request(origin + "/api/auth/passkey/verify-registration", { method: "POST", headers: { "X-Drip-Owner": "owner-1" } });
    backend.user = "owner-2";
    expect((await authHandler(request)).status).toBe(401); expect(backend.handler).not.toHaveBeenCalled();
    backend.user = "owner-1";
    expect((await authHandler(request)).status).toBe(200); expect(backend.handler).toHaveBeenCalledOnce();
    backend.configured = false; expect((await authHandler(request)).status).toBe(503);
  });
  it("reports configuration without exposing secrets", async () => {
    expect(await (await status()).json()).toEqual({ available: true });
    backend.configured = false; expect(await (await status()).json()).toEqual({ available: false });
    expect((await GET(new Request(origin + "/api/cloud", { headers: { "X-Drip-Owner": "owner-1" } }))).status).toBe(401);
  });
  it("never reads or writes a vault without a session", async () => {
    backend.user = null;
    expect((await GET(new Request(origin + "/api/cloud?user_id=someone-else", { headers: { "X-Drip-Owner": "owner-1" } }))).status).toBe(401);
    expect((await PUT(put({ version: 0, envelope }))).status).toBe(401);
    expect(backend.query).not.toHaveBeenCalled();
  });
  it("rejects a switched browser session even when the supplied version matches", async () => {
    backend.user = "owner-2";
    expect((await PUT(put({ version: 0, envelope }))).status).toBe(401);
    expect((await GET(new Request(origin + "/api/cloud", { headers: { "X-Drip-Owner": "owner-1" } }))).status).toBe(401);
    expect(backend.query).not.toHaveBeenCalled();
  });
  it("uses session owner rather than request IDs and sends no-store", async () => {
    const r = await GET(new Request(origin + "/api/cloud?user_id=someone-else", { headers: { "X-Drip-Owner": "owner-1" } }));
    expect(await r.json()).toEqual({ version: 0, envelope: null });
    expect(backend.query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE user_id = $1"), ["owner-1"]);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects cross-origin writes before accessing the database", async () => {
    expect((await PUT(put({}, { origin: "https://evil.example", "Content-Type": "application/json" }))).status).toBe(403);
    expect(backend.query).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized payloads with or without content length", async () => {
    expect((await PUT(put({ version: -1, envelope }))).status).toBe(400);
    expect((await PUT(put(null))).status).toBe(400);
    expect((await PUT(put({ version: 0, envelope: { ...envelope, ct: "not ciphertext!" } }))).status).toBe(400);
    expect((await PUT(new Request(origin + "/api/cloud", { method: "PUT", headers: { origin, "X-Drip-Owner": "owner-1" }, body: "invalid" }))).status).toBe(400);
    expect((await PUT(new Request(origin + "/api/cloud", { method: "PUT", headers: { origin, "X-Drip-Owner": "owner-1" } }))).status).toBe(400);
    expect((await PUT(put({}, { origin, "X-Drip-Owner": "owner-1", "Content-Type": "application/json", "content-length": "3000000" } as any))).status).toBe(413);
    expect((await PUT(put("A".repeat(2_001_500)))).status).toBe(413);
    expect(isCloudEnvelope(null)).toBe(false);
  });
  it("enforces compare-and-swap and reports conflicts instead of overwriting", async () => {
    const r = await PUT(put({ version: 1, envelope })); expect(r.status).toBe(409);
    expect(backend.query).toHaveBeenLastCalledWith(expect.stringContaining("version = $3"), ["owner-1", JSON.stringify(envelope), 1]);
    backend.query.mockImplementation(async (sql: string) => sql.includes("drip_vault_limits") ? { rows: [{ hits: 1 }] } : { rows: [{ version: 2 }] });
    expect(await (await PUT(put({ version: 1, envelope }))).json()).toEqual({ version: 2 });
  });
  it("rate limits reads and writes per authenticated owner", async () => {
    backend.query.mockResolvedValue({ rows: [{ hits: 61 }] });
    expect((await GET(new Request(origin + "/api/cloud", { headers: { "X-Drip-Owner": "owner-1" } }))).status).toBe(429);
    expect((await PUT(put({ version: 0, envelope }))).status).toBe(429);
  });
});
