import { afterEach, expect, it, vi } from "vitest";
import { convertedHolding, isFxCurrency, parseFxRate } from "../lib/exchange-rates";
import { fetchExchangeRate } from "../server/exchange-rates";
import { GET } from "../app/api/exchange-rates/route";

const now = Date.UTC(2026, 9, 31, 12);
const row = { base: "USD", quote: "GBP", date: "2026-10-30", rate: 0.75 };
const quote = { ...row, source: "Frankfurter" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("accepts exact daily pairs and keeps the provider date rather than the fetch date", () => {
  expect(parseFxRate({ ...row, private: "strip" }, "USD", now)).toEqual(quote);
  expect(parseFxRate({ ...row, base: "EUR" }, "EUR", now)?.base).toBe("EUR");
  expect(parseFxRate({ ...row, date: "2026-10-24" }, "USD", now)).not.toBeNull();
  for (const value of [null, [], {}, { ...row, base: "EUR" }, { ...row, quote: "USD" }, { ...row, rate: "0.75" }, { ...row, rate: 0 }, { ...row, rate: -1 }, { ...row, rate: NaN }, { ...row, rate: Infinity }, { ...row, rate: 1_000_001 }, { ...row, date: "2026-11-01" }, { ...row, date: "2026-10-23" }, { ...row, date: "2026-02-31" }, { ...row, date: "2026-99-01" }, { ...row, date: "30/10/2026" }, { ...row, date: 123 }]) expect(parseFxRate(value, "USD", now)).toBeNull();
  expect(isFxCurrency("USD")).toBe(true); expect(isFxCurrency("EUR")).toBe(true); expect(isFxCurrency("GBP")).toBe(false);
});

it("converts fractional shares in the correct direction without changing acquisition cost or income", () => {
  expect(convertedHolding("60", 27.25750597, 0.75)).toEqual({ perShareGBP: 45, valueGBP: 1226.58776865 });
  expect(convertedHolding("60", 2, 0.74821)).toEqual({ perShareGBP: 44.8926, valueGBP: 89.7852 });
  expect(convertedHolding("0", 10, 0.75)).toEqual({ perShareGBP: 0, valueGBP: 0 });
  expect(convertedHolding("10", 0, 0.75)).toEqual({ perShareGBP: 7.5, valueGBP: 0 });
  for (const input of ["", " ", "-1", "Infinity", "NaN", "9007199254740991"]) expect(convertedHolding(input, 1, 0.75)).toBeNull();
  for (const shares of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(convertedHolding("1", shares, 0.75)).toBeNull();
  for (const rate of [0, -1, NaN, Infinity]) expect(convertedHolding("1", 1, rate)).toBeNull();
  expect(convertedHolding("1e12", 1e12, 0.75)).toBeNull();
  expect(convertedHolding("1e12", 1, 1e12)).toBeNull();
});

it("fetches only the fixed public pair with bounded time and no credentials or unvalidated-response caching", async () => {
  const fetcher = vi.fn(async () => Response.json([row]));
  expect(await fetchExchangeRate("USD", fetcher, now)).toEqual(quote);
  expect(fetcher).toHaveBeenCalledWith("https://api.frankfurter.dev/v2/rates?base=USD&quotes=GBP", expect.objectContaining({ credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, cache: "no-store", signal: expect.any(AbortSignal) }));
});

it.each([503, 429, 302])("rejects upstream status %s instead of manufacturing a rate", async status => {
  await expect(fetchExchangeRate("USD", async () => new Response("private upstream details", { status }), now)).rejects.toThrow(/unavailable/);
});

it("rejects oversized, missing, invalid JSON, wrong currency and stale upstream payloads", async () => {
  const responses = [new Response("{}", { headers: { "Content-Length": "16385" } }), new Response("x".repeat(16385)), new Response(null), new Response("not json"), Response.json({ ...row }), Response.json([]), Response.json([row, row]), Response.json([{ ...row, quote: "EUR" }]), Response.json([{ ...row, date: "2026-10-01" }])];
  for (const response of responses) await expect(fetchExchangeRate("USD", async () => response, now)).rejects.toThrow();
  await expect(fetchExchangeRate("USD", async () => { throw new DOMException("timeout", "TimeoutError"); }, now)).rejects.toThrow();
});

it("serves a public allowlisted rate without account data and rejects arbitrary, repeated or extra query parameters", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const fetcher = vi.fn(async () => Response.json([row])); vi.stubGlobal("fetch", fetcher);
  for (const query of ["", "base=GBP", "base=usd", "base=https://evil.example", "base=USD&base=EUR", "base=USD&account=private"]) {
    const response = await GET(new Request("https://drip.example/api/exchange-rates?" + query));
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(fetcher).not.toHaveBeenCalled();
  const response = await GET(new Request("https://drip.example/api/exchange-rates?base=USD", { headers: { cookie: "private-session", "x-drip-owner": "private-account" } }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(quote);
  expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=3600");
  expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/private-session|private-account/);
});

it("returns a safe non-cacheable 503 on failure with no upstream details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sensitive upstream diagnostic"); }));
  const response = await GET(new Request("https://drip.example/api/exchange-rates?base=EUR"));
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Daily exchange rates are unavailable. Try again shortly." });
  expect(log).toHaveBeenCalledWith("Drip daily exchange rate unavailable.", { provider: "Frankfurter", base: "EUR" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
});
