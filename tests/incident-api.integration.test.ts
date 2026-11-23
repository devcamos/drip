import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../app/api/exchange-rates/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("correlates a real upstream 503 route response with one privacy-safe incident alert", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  vi.stubEnv("VERCEL_ENV", "preview");
  const calls: Array<{ url: string; body: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://hooks.slack.com/")) {
      calls.push({ url, body: String(init?.body) });
      return new Response("ok");
    }
    throw new Error("upstream internal user=secret@example.test");
  }));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await GET(new Request("https://drip.example/api/exchange-rates?base=USD"));
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body.error).toBe("Daily exchange rates are unavailable. Try again shortly.");
  expect(response.headers.get("x-drip-incident-reference")).toBeTruthy();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://hooks.slack.com/services/T000/B000/placeholder");
  expect(calls[0].body).toContain("GET /api/exchange-rates returned HTTP 503");
  expect(calls[0].body).not.toMatch(/secret@example|upstream internal|base=USD/);
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret@example");
});

it("keeps expected route validation errors out of the incident channel", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await GET(new Request("https://drip.example/api/exchange-rates?base=GBP"));
  expect(response.status).toBe(400);
  expect(response.headers.has("x-drip-incident-reference")).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
