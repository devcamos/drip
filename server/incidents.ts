import { createHash, randomUUID } from "node:crypto";

type Incident = {
  reference: string;
  environment: string;
  method: string;
  route: string;
  status: number;
  errorType: string;
  summary: string;
  fingerprint: string;
};

type IncidentOptions = {
  webhook?: string;
  environment?: string;
  fetcher?: typeof fetch;
  log?: (entry: string) => void;
  reference?: () => string;
};

type ApiHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

function requestFrom(args: readonly unknown[]): Request {
  const request = args.find((value): value is Request =>
    typeof value === "object" && value !== null && "url" in value && "method" in value,
  );
  return request ?? new Request("http://localhost/api/unknown");
}

function safeRoute(request: Request): string {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/auth/")) return "/api/auth/[action]";
  const publicRoutes = new Set([
    "/api/cloud", "/api/cloud/status", "/api/recovery-codes", "/api/feedback",
    "/api/exchange-rates", "/api/notifications/config", "/api/notifications/dispatch",
    "/api/notifications/subscription", "/api/notifications/test",
  ]);
  return publicRoutes.has(pathname) ? pathname : "/api/[route]";
}

function safeErrorType(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(name) ? name : "UnknownError";
}

function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/database|postgres|neon|sql|ECONNREFUSED/i.test(message)) return "database dependency failed";
  if (/timeout|timed out|AbortError|TimeoutError/i.test(message)) return "dependency timed out";
  if (/fetch|network|socket|DNS|upstream/i.test(message)) return "network dependency failed";
  if (/auth|session|credential|password|token/i.test(message)) return "authentication dependency failed";
  return "unhandled server exception";
}

function fingerprint(error: unknown, status: number): string {
  const source = error instanceof Error ? `${error.name}:${error.message}` : `http:${status}`;
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function slackWebhook(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "hooks.slack.com" || !url.pathname.startsWith("/services/") || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export async function sendIncident(incident: Incident, options: IncidentOptions = {}): Promise<void> {
  const webhook = slackWebhook(options.webhook ?? process.env.DRIP_INCIDENT_SLACK_WEBHOOK);
  if (!webhook) return;

  const payload = {
    text: [
      `Drip server incident ${incident.reference}`,
      `Environment: ${incident.environment}`,
      `Request: ${incident.method} ${incident.route} returned HTTP ${incident.status}`,
      `Error: ${incident.errorType}; ${incident.summary}; fingerprint ${incident.fingerprint}`,
    ].join("\n"),
  };
  const log = options.log ?? console.error;
  try {
    const response = await (options.fetcher ?? fetch)(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    if (!response.ok) log(JSON.stringify({ event: "drip.incident.delivery_failed", reference: incident.reference, status: response.status }));
  } catch {
    log(JSON.stringify({ event: "drip.incident.delivery_failed", reference: incident.reference }));
  }
}

async function report(request: Request, status: number, error?: unknown, options: IncidentOptions = {}): Promise<string> {
  const reference = (options.reference ?? randomUUID)();
  const incident: Incident = {
    reference,
    environment: options.environment ?? process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "local"),
    method: request.method.toUpperCase().slice(0, 10),
    route: safeRoute(request),
    status,
    errorType: error === undefined ? "Http5xxResponse" : safeErrorType(error),
    summary: error === undefined ? "handler returned a server error" : safeErrorSummary(error),
    fingerprint: fingerprint(error, status),
  };
  (options.log ?? console.error)(JSON.stringify({ event: "drip.api.incident", ...incident }));
  await sendIncident(incident, options);
  return reference;
}

/** Wrap an App Router handler so every server response is correlated, while 4xx stays quiet. */
export function withApiIncidents<Args extends unknown[]>(handler: ApiHandler<Args>): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const request = requestFrom(args);
    let response: Response;
    try {
      response = await handler(...args);
    } catch (error) {
      const reference = await report(request, 500, error);
      return Response.json({ error: "Drip could not complete this request. Try again shortly.", reference }, {
        status: 500,
        headers: { "Cache-Control": "no-store", "x-drip-incident-reference": reference },
      });
    }
    if (response.status < 500) return response;

    // Some route services already log and return a support reference. Preserve
    // it when present so the user, server log, and Slack alert share one ID.
    const existingReference = response.headers.get("x-drip-incident-reference");
    const reference = await report(request, response.status, undefined, {
      ...(existingReference && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingReference)
        ? { reference: () => existingReference }
        : {}),
    });
    const headers = new Headers(response.headers);
    headers.set("x-drip-incident-reference", reference);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
