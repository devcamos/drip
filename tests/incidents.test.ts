import { afterEach, expect, it, vi } from "vitest";
import { sendIncident, withApiIncidents } from "../server/incidents";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not page or annotate expected client failures", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => Response.json({ error: "invalid input" }, { status: 422 }));
  const response = await handler(new Request("https://drip.example/api/recovery-codes"));
  expect(response.status).toBe(422);
  expect(response.headers.has("x-drip-incident-reference")).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("reports 5xx with a correlation reference and only privacy-safe fields", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  vi.stubEnv("VERCEL_ENV", "preview");
  const fetcher = vi.fn(async () => new Response("ok", { status: 200 })); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => Response.json({ error: "private database text" }, { status: 503 }));
  const response = await handler(new Request("https://drip.example/api/auth/sign-in/gamertag?username=Rampage29", { method: "POST" }));
  const reference = response.headers.get("x-drip-incident-reference");
  expect(reference).toMatch(/^[0-9a-f-]{36}$/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe("https://hooks.slack.com/services/T000/B000/placeholder");
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.redirect).toBe("error");
  const payload = JSON.parse(String(init.body)) as { text: string };
  expect(payload.text).toContain(`Drip server incident ${reference}`);
  expect(payload.text).toContain("Environment: preview");
  expect(payload.text).toContain("POST /api/auth/[action] returned HTTP 503");
  expect(payload.text).toContain("Http5xxResponse");
  expect(payload.text).not.toMatch(/Rampage29|username=|private database text|cookie|recovery/i);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rampage29|private database text/);
});

it("converts thrown exceptions to a safe 500 while preserving useful server correlation", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => { throw new Error("password=ultra-secret Recovery code 1234-1234"); });
  const response = await handler(new Request("https://drip.example/api/cloud/12345678901234567890", { method: "PUT" }));
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.error).toBe("Drip could not complete this request. Try again shortly.");
  expect(body.reference).toBe(response.headers.get("x-drip-incident-reference"));
  expect(JSON.stringify(body)).not.toMatch(/ultra-secret|1234-1234/);
  const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { text: string };
  expect(payload.text).toContain("PUT /api/[route] returned HTTP 500");
  expect(payload.text).toContain("Error: Error; authentication dependency failed; fingerprint ");
  expect(payload.text).not.toMatch(/ultra-secret|1234-1234|password=/);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/ultra-secret|1234-1234/);
});

it("keeps the original 5xx response when the Slack hook is absent or invalid", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://example.com/collect");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sendIncident({ reference: "ref", environment: "preview", method: "GET", route: "/api/cloud", status: 503, errorType: "Http5xxResponse", summary: "handler returned a server error", fingerprint: "123456abcdef" })).resolves.toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
  const handler = withApiIncidents(async (_request: Request) => new Response("service unavailable", { status: 503, headers: { "cache-control": "no-store" } }));
  const response = await handler(new Request("https://drip.example/api/cloud"));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-drip-incident-reference")).toBeTruthy();
  expect(await response.text()).toBe("service unavailable");
});

it("does not let Slack timeouts or provider errors replace an API response", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network details must stay private"); }));
  const warn = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => new Response("upstream failure", { status: 502 }));
  const response = await handler(new Request("https://drip.example/api/exchange-rates"));
  expect(response.status).toBe(502);
  expect(await response.text()).toBe("upstream failure");
  expect(JSON.stringify(warn.mock.calls)).not.toContain("network details must stay private");
});

it("does not enable delivery when no webhook is configured", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sendIncident({ reference: "ref", environment: "preview", method: "GET", route: "/api/cloud", status: 503, errorType: "Http5xxResponse", summary: "handler returned a server error", fingerprint: "123456abcdef" })).resolves.toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
});

it("uses only the approved Slack incoming-hook host and path", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const incident = { reference: "ref", environment: "preview", method: "GET", route: "/api/cloud", status: 503, errorType: "Http5xxResponse", summary: "handler returned a server error", fingerprint: "123456abcdef" };
  for (const webhook of ["http://hooks.slack.com/services/T/B/X", "https://hooks.slack.com.evil.example/services/T/B/X", "https://hooks.slack.com/api/test", "https://hooks.slack.com/services/T/B/X?token=private"]) {
    await sendIncident(incident, { webhook, fetcher });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
