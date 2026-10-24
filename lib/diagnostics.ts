/** Allowlisted diagnostics only. Never serialize errors, messages, URLs or app data. */
const operations = ["auth", "cloud", "recovery", "cloud.status", "network", "storage.open", "storage.read", "storage.write", "app.load", "app.save", "app.render", "app.unhandled"] as const;
export type DiagnosticOperation = typeof operations[number];
type ErrorKind = "schema_mismatch" | "database_unavailable" | "storage_full" | "cancelled" | "network" | "unexpected";
type Context = { status?: number; requestId?: string; durationMs?: number };
const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const requestReference = (value: string | null | undefined) => value && referencePattern.test(value) ? value : undefined;

export function errorKind(error: unknown): ErrorKind {
  const seen = new Set<unknown>();
  for (let depth = 0; error && typeof error === "object" && !seen.has(error) && depth < 4; depth++) {
    seen.add(error);
    const item = error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (["42703", "42P01"].includes(String(item.code)) || (typeof item.message === "string" && /database schema mismatch/i.test(item.message))) return "schema_mismatch";
    if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "08006", "53300", "57P01"].includes(String(item.code))) return "database_unavailable";
    if (item.name === "QuotaExceededError") return "storage_full";
    if (item.name === "AbortError" || item.name === "NotAllowedError") return "cancelled";
    if (item.name === "TypeError" && typeof item.message === "string" && /^(Failed to fetch|fetch failed|Load failed)$/i.test(item.message)) return "network";
    error = item.cause;
  }
  return "unexpected";
}

// Bound repeated browser failures; no persistent buffer or telemetry endpoint.
const recent = new Map<string, number>();
export function logFailure(operation: DiagnosticOperation, error?: unknown, context: Context = {}) {
  try {
    if (!operations.includes(operation)) return;
    const kind = errorKind(error);
    if (kind === "cancelled") return;
    const status = Number.isInteger(context.status) && context.status! >= 400 && context.status! <= 599 ? context.status : undefined;
    const requestId = requestReference(context.requestId);
    if (typeof window !== "undefined") {
      const key = `${operation}:${kind}:${status ?? ""}`;
      const now = Date.now();
      if (recent.has(key) && now - recent.get(key)! < 60_000) return;
      if (recent.size >= 100) recent.clear();
      recent.set(key, now);
    }
    const record = JSON.stringify({ app: "drip", event: "operation_failed", operation, kind, status, requestId,
      durationMs: Number.isFinite(context.durationMs) ? Math.max(0, Math.round(context.durationMs!)) : undefined });
    if (status && status < 500) console.warn(record);
    else console.error(record);
  } catch { /* Diagnostics must never interrupt saving, authentication or error handling. */ }
}

export function responseError(response: Response, message: string) {
  const reference = requestReference(response.headers.get("x-drip-request-id"));
  return new Error(reference ? `${message} Reference: ${reference}.` : message);
}
