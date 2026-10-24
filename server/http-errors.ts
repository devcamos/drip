import { AsyncLocalStorage } from "node:async_hooks";
import { errorKind, logFailure, type DiagnosticOperation } from "../lib/diagnostics";
import { incidentFor, pipelineFailure } from "./incidents";
import { scheduleIncident } from "./incident-queue";

type RequestContext = { operation: DiagnosticOperation; requestId: string; started: number; reported: boolean; kind: ReturnType<typeof errorKind> };
const requests = new AsyncLocalStorage<RequestContext>();
// Only responses constructed by this module may retain a specific safe code.
// An upstream body/header cannot opt itself out of sanitization.
const safeFailures = new WeakSet<Response>();

export function reportException(error: unknown) {
  const context = requests.getStore();
  if (context?.reported) return;
  if (context) {
    context.reported = true;
    try { context.kind = errorKind(error); } catch { context.kind = "unexpected"; }
  }
  logFailure(context?.operation ?? "auth", error, { status: 503, requestId: context?.requestId,
    durationMs: context ? performance.now() - context.started : undefined });
}

export function unavailable(code: string, message: string) {
  const requestId = requests.getStore()?.requestId;
  const response = Response.json({ code, message, ...(requestId ? { requestId } : {}) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  safeFailures.add(response);
  return response;
}

/** Catch the whole route, including configuration/session checks before its handler. */
export function withApiErrors(operation: DiagnosticOperation, work: () => Promise<Response>, fallback: { code: string; message: string }, request?: Request) {
  const context: RequestContext = { operation, requestId: crypto.randomUUID(), started: performance.now(), reported: false, kind: "unexpected" };
  return requests.run(context, async () => {
    let response: Response;
    try { response = await work(); }
    catch (error) { reportException(error); response = unavailable(fallback.code, fallback.message); }
    if (response.status >= 400 && !context.reported) logFailure(operation, undefined, { status: response.status,
      requestId: context.requestId, durationMs: performance.now() - context.started });
    if (response.status >= 500) {
      try {
        const incident = incidentFor(operation, response.status, context.requestId, context.kind, request);
        if (incident) scheduleIncident(incident);
      } catch { pipelineFailure("schedule", context.requestId); }
      // A returned SDK/proxy error can contain secrets too, not only a thrown
      // exception. Keep its status, but never expose its body or partial cookies.
      if (!safeFailures.has(response)) {
        void response.body?.cancel().catch(() => {});
        response = Response.json({ ...fallback, requestId: context.requestId }, { status: response.status });
      }
    }
    // Preserve the body stream and all Set-Cookie entries, including immutable responses.
    const headers = new Headers(response.headers);
    headers.set("X-Drip-Request-Id", context.requestId);
    if (response.status >= 400) headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}
