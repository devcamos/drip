import { afterEach, expect, it, vi } from "vitest";
import { withApiErrors, reportException } from "../server/http-errors";

afterEach(() => vi.restoreAllMocks());

it("keeps concurrent request references separate and preserves multiple auth cookies", async () => {
  const work = async () => {
    await Promise.resolve();
    const headers = new Headers(); headers.append("Set-Cookie", "one=synthetic; HttpOnly"); headers.append("Set-Cookie", "two=synthetic; HttpOnly");
    return new Response("unchanged", { headers });
  };
  const [a, b] = await Promise.all([withApiErrors("auth", work, { code: "AUTH_UNAVAILABLE", message: "Try again." }), withApiErrors("auth", work, { code: "AUTH_UNAVAILABLE", message: "Try again." })]);
  expect(a.headers.get("x-drip-request-id")).not.toBe(b.headers.get("x-drip-request-id"));
  expect(a.headers.getSetCookie()).toEqual(["one=synthetic; HttpOnly", "two=synthetic; HttpOnly"]);
  expect(await a.text()).toBe("unchanged");
});

it("logs an exception once and returns only safe JSON without queued cookies", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await withApiErrors("auth", async () => {
    reportException(new Error("database schema mismatch; secret query"));
    throw new Error("password=secret");
  }, { code: "AUTH_UNAVAILABLE", message: "Try again." });
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.json()).toEqual({ code: "AUTH_UNAVAILABLE", message: "Try again.", requestId: response.headers.get("x-drip-request-id") });
  expect(output).toHaveBeenCalledOnce();
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/secret|password|query/);
});

it("records expected denials as warnings without logging or consuming their bodies", async () => {
  const output = vi.spyOn(console, "warn").mockImplementation(() => {});
  const response = await withApiErrors("cloud", async () => Response.json({ error: "conflict detail" }, { status: 409 }), { code: "CLOUD_UNAVAILABLE", message: "Try again." });
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "conflict detail" });
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "cloud", status: 409 });
  expect(JSON.stringify(output.mock.calls)).not.toContain("conflict detail");
});
