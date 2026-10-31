import { beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ configured: true, user: "owner-1" as string | null, query: vi.fn(), handler: vi.fn() }));
vi.mock("../server/auth", () => ({ cloudConfigured: () => backend.configured, getAuth: () => ({ handler: backend.handler, api: { getSession: async () => backend.user ? { user: { id: backend.user } } : null } }), database: () => ({ query: backend.query }) }));
import { GET, PUT } from "../app/api/cloud/route";
import { GET as status } from "../app/api/cloud/status/route";
import { isCloudEnvelope } from "../server/cloud-store";
import { POST as authHandler, GET as sessionHandler } from "../app/api/auth/[...all]/route";
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
  it("prevents browser and CDN caching for session responses without losing cookies", async () => {
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "public, max-age=600" });
    headers.append("Set-Cookie", "synthetic-session=synthetic; HttpOnly; Secure");
    headers.append("Set-Cookie", "synthetic-other=synthetic; HttpOnly; Secure");
    backend.handler.mockResolvedValue(new Response(JSON.stringify({ user: { id: "owner-1" } }), {
      headers,
    }));
    const response = await sessionHandler(new Request(origin + "/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("synthetic-session=synthetic");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.json()).toEqual({ user: { id: "owner-1" } });
  });
  it("also prevents caching when auth configuration or owner verification fails", async () => {
    const request = () => new Request(origin + "/api/auth/get-session", { headers: { "X-Drip-Owner": "owner-1" } });
    backend.user = "owner-2";
    const switched = await sessionHandler(request());
    expect(switched.status).toBe(401);
    expect(switched.headers.get("cache-control")).toBe("no-store");
    backend.configured = false;
    const unavailable = await sessionHandler(request());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
  });
  it("adds no-store to an immutable auth redirect while preserving its destination", async () => {
    backend.handler.mockResolvedValue(Response.redirect(origin + "/", 302));
    const response = await sessionHandler(new Request(origin + "/api/auth/callback"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(origin + "/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("bounds custom password auth bodies and rejects cross-origin requests before invoking auth", async () => {
    const url = origin + "/api/auth/sign-in/gamertag";
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }))).status).toBe(403);
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin } }))).status).toBe(400);
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin }, body: "x".repeat(5000) }))).status).toBe(413);
    expect(backend.handler).not.toHaveBeenCalled();
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin }, body: "{}" }))).status).toBe(200);
  });
  it.each(["gamertag-devices", "gamertag-revoke-device"])("protects %s with origin and streamed body bounds, including the stable Preview origin", async path => {
    const url = origin + "/api/auth/sign-in/" + path;
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }))).status).toBe(403);
    expect((await authHandler(new Request(url, { method: "POST", headers: { origin }, body: "x".repeat(4097) }))).status).toBe(413);
    expect(backend.handler).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_BRANCH_URL", "drip-stable-preview.vercel.app");
    expect((await authHandler(new Request("https://drip-stable-preview.vercel.app/api/auth/sign-in/" + path, { method: "POST", headers: { origin: "https://drip-stable-preview.vercel.app" }, body: "{}" }))).status).toBe(200);
    vi.unstubAllEnvs();
  });
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
  it.each([1, 2])("enforces compare-and-swap for encrypted format v%s and reports conflicts instead of overwriting", async v => {
    const envelope = { app: "drip-cloud", v, iv: "AAAAAAAAAAAAAAAA", ct: "A".repeat(32) };
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
