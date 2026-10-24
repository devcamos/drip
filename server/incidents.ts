import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { errorKind, requestReference, type DiagnosticOperation } from "../lib/diagnostics";

export const INCIDENT_TOPIC = "drip-incidents";
export const RETENTION_SECONDS = 604800;
const routes = ["/api/auth/[...all]", "/api/auth/ok", "/api/auth/get-session", "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out", "/api/auth/sign-in/gamertag", "/api/auth/sign-in/gamertag-key", "/api/auth/gamertag-password", "/api/cloud", "/api/cloud/status", "/api/recovery-codes"] as const;
const incidentSchema = z.object({
  app: z.literal("drip"), v: z.literal(1),
  operation: z.enum(["auth", "cloud", "recovery", "cloud.status"]),
  route: z.enum(routes), method: z.enum(["GET", "POST", "PUT", "OTHER"]),
  status: z.number().int().min(500).max(599),
  kind: z.enum(["schema_mismatch", "database_unavailable", "storage_full", "cancelled", "network", "unexpected"]),
  requestId: z.string().uuid(), occurredAt: z.iso.datetime(),
  environment: z.enum(["production", "preview", "development"]),
  release: z.string().regex(/^(?:[a-f0-9]{40}|unknown)$/),
  deployment: z.string().regex(/^(?:dpl_[A-Za-z0-9]{10,80}|local)$/),
}).strict();
export type Incident = z.infer<typeof incidentSchema>;
const signedSchema = z.object({ incident: incidentSchema, signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type SignedIncident = z.infer<typeof signedSchema>;
export const incidentsEnabled = () => process.env.DRIP_INCIDENTS_ENABLED === "true";

function signingSecret() {
  const secret = process.env.DRIP_INCIDENT_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("Incident signing is not configured.");
  return secret;
}
// Canonical schema order is used for signing and verification; no unknown fields.
function signature(incident: Incident) {
  return createHmac("sha256", signingSecret()).update(JSON.stringify(incidentSchema.parse(incident))).digest("hex");
}
export function signIncident(incident: Incident): SignedIncident {
  return { incident: incidentSchema.parse(incident), signature: signature(incident) };
}
export function verifiedIncident(value: unknown): Incident {
  const parsed = signedSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid incident envelope.");
  const { incident, signature: supplied } = parsed.data;
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(incident), "hex"))) throw new Error("Invalid incident signature.");
  if (incident.environment !== (process.env.VERCEL_ENV ?? "development")) throw new Error("Incident environment mismatch.");
  const age = Date.now() - Date.parse(incident.occurredAt);
  if (age < -60_000 || age > RETENTION_SECONDS * 1000) throw new Error("Expired incident envelope.");
  return incident;
}
export function incidentFor(operation: DiagnosticOperation, status: number, reference: string, kind: ReturnType<typeof errorKind>, request?: Request): Incident | undefined {
  if (status < 500 || status > 599 || !requestReference(reference)) return;
  if (!["auth", "cloud", "recovery", "cloud.status"].includes(operation)) return;
  const fallback = operation === "auth" ? "/api/auth/[...all]" : operation === "cloud" ? "/api/cloud" : operation === "cloud.status" ? "/api/cloud/status" : "/api/recovery-codes";
  const pathname = request ? new URL(request.url).pathname : fallback;
  return incidentSchema.parse({ app: "drip", v: 1, operation,
    route: routes.includes(pathname as typeof routes[number]) ? pathname : fallback,
    method: ["GET", "POST", "PUT"].includes(request?.method ?? "") ? request!.method : "OTHER",
    status, kind, requestId: reference, occurredAt: new Date().toISOString(),
    environment: ["production", "preview"].includes(process.env.VERCEL_ENV ?? "") ? process.env.VERCEL_ENV : "development",
    release: /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? "") ? process.env.VERCEL_GIT_COMMIT_SHA : "unknown",
    deployment: /^dpl_[A-Za-z0-9]{10,80}$/.test(process.env.VERCEL_DEPLOYMENT_ID ?? "") ? process.env.VERCEL_DEPLOYMENT_ID : "local",
  });
}
/** One alert per issue/release in each five-minute bucket, across instances. */
export function incidentKey(incident: Incident) {
  const bucket = Math.floor(Date.parse(incident.occurredAt) / 300_000);
  return createHash("sha256").update(JSON.stringify([incident.app, incident.environment, incident.operation, incident.route, incident.method, incident.status, incident.kind, incident.release, bucket])).digest("hex");
}

export function pipelineFailure(stage: "schedule" | "publish" | "delivery", requestId?: string) {
  try { console.error(JSON.stringify({ app: "drip", event: "incident_pipeline_failed", stage, requestId: requestReference(requestId) })); }
  catch { /* Reporting must never change the original response. */ }
}
