import { AsyncLocalStorage } from "node:async_hooks";
import { logFailure, type DiagnosticOperation } from "../lib/diagnostics";

type RequestContext = { operation: DiagnosticOperation; requestId: string; started: number; reported: boolean };
const requests = new AsyncLocalStorage<RequestContext>();

export function reportException(error: unknown) {
  const context = requests.getStore();
  if (context?.reported) return;
  if (context) context.reported = true;
  logFailure(context?.operation ?? "auth", error, { status: 503, requestId: context?.requestId,
    durationMs: context ? performance.now() - context.started : undefined });
}

export function unavailable(code: string, message: string) {
  const requestId = requests.getStore()?.requestId;
  return Response.json({ code, message, ...(requestId ? { requestId } : {}) }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

/** Catch the whole route, including configuration/session checks before its handler. */
export function withApiErrors(operation: DiagnosticOperation, work: () => Promise<Response>, fallback: { code: string; message: string }) {
  const context: RequestContext = { operation, requestId: crypto.randomUUID(), started: performance.now(), reported: false };
  return requests.run(context, async () => {
    let response: Response;
    try { response = await work(); }
    catch (error) { reportException(error); response = unavailable(fallback.code, fallback.message); }
    if (response.status >= 400 && !context.reported) logFailure(operation, undefined, { status: response.status,
      requestId: context.requestId, durationMs: performance.now() - context.started });
    // Preserve the body stream and all Set-Cookie entries, including immutable responses.
    const headers = new Headers(response.headers);
    headers.set("X-Drip-Request-Id", context.requestId);
    if (response.status >= 400) headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}
