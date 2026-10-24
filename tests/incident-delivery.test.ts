import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MessageMetadata } from "@vercel/queue";
import { incidentFor, signIncident } from "../server/incidents";
import { deliverIncident, retryIncident, IncidentDeliveryError } from "../server/incident-delivery";
const webhook = ["https:", "", "hooks.slack.com", "services", "T0AMXNWGK4L", "BTEST", "SYNTHETICTESTONLY"].join("/");
const signed = () => signIncident(incidentFor("auth", 503, crypto.randomUUID(), "schema_mismatch")!);
beforeEach(() => {
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("DRIP_INCIDENT_SIGNING_SECRET", "synthetic-signing-key-not-real-12345"); vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK_URL", webhook);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("posts one plain-text alert with actionable safe details and a bounded request", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("ok")); vi.stubGlobal("fetch", fetcher);
  const envelope = signed(); await deliverIncident(envelope);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, options] = fetcher.mock.calls[0]; const payload = JSON.parse(options.body);
  expect(url).toBe(webhook); expect(options.redirect).toBe("error"); expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(payload.blocks[0].text.type).toBe("plain_text");
  expect(payload.text).toContain("PREVIEW — HTTP 503"); expect(payload.text).toContain(envelope.incident.requestId);
  expect(payload.text).toContain("schema_mismatch"); expect(payload.text).not.toContain(envelope.signature);
});
it.each(["http://hooks.slack.com/services/T0AMXNWGK4L/BTEST/SYNTHETIC", "https://attacker.example/services/T0AMXNWGK4L/BTEST/SYNTHETIC", webhook + "?private=value", "", webhook.replace("T0AMXNWGK4L", "TOTHER")])("refuses an invalid or wrong-workspace destination", async url => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK_URL", url); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(deliverIncident(signed())).rejects.toThrow("Incident delivery is unavailable"); expect(fetcher).not.toHaveBeenCalled();
});
it("rejects unsigned/altered messages, cross-environment delivery and disabled alerts before sending", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(deliverIncident({ incident: signed().incident, signature: "0".repeat(64) })).rejects.toThrow(IncidentDeliveryError);
  const message = signed(); vi.stubEnv("VERCEL_ENV", "production"); await expect(deliverIncident(message)).rejects.toThrow(IncidentDeliveryError);
  vi.stubEnv("DRIP_INCIDENTS_ENABLED", "false"); await expect(deliverIncident(message)).rejects.toThrow(IncidentDeliveryError);
  expect(fetcher).not.toHaveBeenCalled();
});
it("honors Slack rate limits and never logs or throws the webhook or response body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider details", { status: 429, headers: { "Retry-After": "120" } })));
  let failure: unknown; try { await deliverIncident(signed()); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ retryAfterSeconds: 120, message: "Incident delivery is unavailable." });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(retryIncident(failure, { deliveryCount: 1 } as MessageMetadata)).toEqual({ afterSeconds: 120 });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/SYNTHETICTESTONLY|provider/);
});
it.each(["network", "bad-ack", "http500"])("keeps delivery retryable after %s", async failure => {
  const fetcher = vi.fn();
  if (failure === "network") fetcher.mockRejectedValue(new Error(webhook));
  else fetcher.mockResolvedValue(new Response("private details", { status: failure === "http500" ? 500 : 200 }));
  vi.stubGlobal("fetch", fetcher); await expect(deliverIncident(signed())).rejects.toThrow(/^Incident delivery is unavailable\.$/);
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(retryIncident(new Error("private"), { deliveryCount: 500 } as MessageMetadata)).toEqual({ afterSeconds: 21600 });
});
