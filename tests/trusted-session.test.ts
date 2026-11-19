// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { verifyTrustedSession } from "../lib/trusted-session";
import { safeFetch } from "../lib/worker-safety";

vi.mock("../lib/worker-safety", () => ({ safeFetch: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("accepts only the owner returned by the current server session", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ user: { id: "owner" } }));
  expect(await verifyTrustedSession("owner")).toBe("valid");
  expect(safeFetch).toHaveBeenCalledWith("/api/auth/get-session", expect.objectContaining({ credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) }));
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json({ user: { id: "other" } }));
  expect(await verifyTrustedSession("owner")).toBe("invalid");
});

it("treats an absent or unauthorized session as invalid", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(safeFetch).mockResolvedValueOnce(Response.json(null)).mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect(await verifyTrustedSession("owner")).toBe("invalid");
  expect(await verifyTrustedSession("owner")).toBe("invalid");
});

it("distinguishes offline access from unavailable or malformed responses", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.mocked(safeFetch).mockClear();
  expect(await verifyTrustedSession("owner")).toBe("offline"); expect(safeFetch).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  vi.mocked(safeFetch).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ user: {} })).mockRejectedValueOnce(new Error("network"));
  expect(await verifyTrustedSession("owner")).toBe("unavailable");
  expect(await verifyTrustedSession("owner")).toBe("unavailable");
  expect(await verifyTrustedSession("owner")).toBe("unavailable");
});

it("bounds verification even when the private request queue never starts fetch", async () => {
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(safeFetch).mockImplementationOnce(() => new Promise(() => {}));
  const pending = verifyTrustedSession("owner");
  await vi.advanceTimersByTimeAsync(8000);
  expect(await pending).toBe("unavailable");
});
