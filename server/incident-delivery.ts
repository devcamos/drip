import type { MessageMetadata } from "@vercel/queue";
import { incidentsEnabled, pipelineFailure, verifiedIncident, type Incident } from "./incidents";

export class IncidentDeliveryError extends Error {
  constructor(public readonly retryAfterSeconds = 60) { super("Incident delivery is unavailable."); }
}
function webhook() {
  try {
    const url = new URL(process.env.DRIP_INCIDENT_SLACK_WEBHOOK_URL ?? "");
    if (url.protocol === "https:" && url.hostname === "hooks.slack.com" && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/services\/T0AMXNWGK4L\/B[A-Z0-9]+\/[A-Za-z0-9]+$/.test(url.pathname)) return url.href;
  } catch { /* Never expose a secret-bearing URL in an exception. */ }
  throw new IncidentDeliveryError(3600);
}
export function incidentText(incident: Incident) {
  return `Drip ${incident.environment.toUpperCase()} — HTTP ${incident.status}\n` +
    `Operation: ${incident.operation}\nRoute: ${incident.method} ${incident.route}\n` +
    `Error category: ${incident.kind}\nTime: ${incident.occurredAt}\n` +
    `Release: ${incident.release}\nDeployment: ${incident.deployment}\nReference: ${incident.requestId}\n` +
    "Repeated occurrences are grouped into five-minute windows; counts are not collected. Investigate with sanitized evidence locally; provide a Preview fix. No Production access for the investigator.";
}
export async function deliverIncident(value: unknown) {
  if (!incidentsEnabled()) throw new IncidentDeliveryError(3600);
  // Callback bodies/headers alone do not authorize posting to Slack.
  let incident: Incident;
  try { incident = verifiedIncident(value); } catch { throw new IncidentDeliveryError(3600); }
  const url = webhook();
  let response: Response;
  try {
    const text = incidentText(incident);
    response = await fetch(url, { method: "POST", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks: [{ type: "section", text: { type: "plain_text", text, emoji: false } }] }),
    });
    if (response.ok && (await response.text()).trim() === "ok") return;
  } catch { throw new IncidentDeliveryError(); }
  void response.body?.cancel().catch(() => {});
  const retry = response.status === 429 ? Number(response.headers.get("retry-after")) : 60;
  throw new IncidentDeliveryError(Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.max(60, Math.ceil(retry))) : 60);
}
export function retryIncident(error: unknown, metadata: MessageMetadata) {
  // Never silently acknowledge a failed notification. Retained messages remain
  // retryable for seven days; the queue and this log expose delivery problems.
  pipelineFailure("delivery");
  const requested = error instanceof IncidentDeliveryError ? error.retryAfterSeconds : 60;
  const count = Number.isSafeInteger(metadata.deliveryCount) ? metadata.deliveryCount : 1;
  return { afterSeconds: Math.min(86400, Math.max(requested, Math.min(21600, 60 * 2 ** Math.min(9, Math.max(0, count - 1))))) };
}
