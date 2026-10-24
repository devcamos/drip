import { after } from "next/server";
import { QueueClient } from "@vercel/queue";
import { INCIDENT_TOPIC, RETENTION_SECONDS, incidentKey, incidentsEnabled, pipelineFailure, signIncident, type Incident } from "./incidents";

// Independent of Drip's auth/financial database; no app database call is made.
export const incidentQueue = new QueueClient({ region: "iad1", telemetry: { isEnabled: false } });
export async function publishIncident(incident: Incident) {
  const signed = signIncident(incident);
  const options = { idempotencyKey: incidentKey(incident), retentionSeconds: RETENTION_SECONDS };
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await incidentQueue.send(INCIDENT_TOPIC, signed, options); return; }
    catch { /* Same key makes an uncertain first acknowledgement safe to retry. */ }
  }
  throw new Error("Incident queue is unavailable.");
}
export function scheduleIncident(incident: Incident) {
  if (!incidentsEnabled()) return;
  try {
    after(async () => {
      try { await publishIncident(incident); }
      catch { pipelineFailure("publish", incident.requestId); }
    });
  } catch { pipelineFailure("schedule", incident.requestId); }
}
