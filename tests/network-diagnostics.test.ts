import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/db", async importOriginal => ({ ...await importOriginal<typeof import("../lib/db")>(), browserDeviceId: async () => "synthetic-device", getItem: async () => undefined }));
import { safeFetch } from "../lib/worker-safety";
beforeEach(() => { vi.stubGlobal("window", undefined); vi.stubGlobal("navigator", {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("records a failing auth status/reference without consuming the response or leaking request details", async () => {
  const reference = "11111111-1111-4111-8111-111111111111";
  const response = Response.json({ message: "safe", requestId: reference }, { status: 503, headers: { "X-Drip-Request-Id": reference } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const actual = await safeFetch("/api/auth/sign-in/gamertag?secret=private", { method: "POST", headers: { Authorization: "private" }, body: "password=private" });
  expect(actual).toBe(response); expect(await actual.json()).toEqual({ message: "safe", requestId: reference });
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "auth", status: 503, requestId: reference });
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/private|password|secret|Authorization|gamertag/);
});

it("logs and rethrows a network exception without changing retry or success semantics", async () => {
  const error = new TypeError("Failed to fetch");
  const fetcher = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetcher);
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(safeFetch("/api/cloud", { method: "PUT", body: "private ciphertext" })).rejects.toBe(error);
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "cloud", kind: "network" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(await (await safeFetch("/api/cloud")).json()).toEqual({ saved: true });
  expect(output).toHaveBeenCalledOnce();
});
