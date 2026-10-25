import { afterEach, expect, it, vi } from "vitest";
import { errorKind, logFailure, requestReference, responseError } from "../lib/diagnostics";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["backup.export", "backup.restore"] as const)("allows %s diagnostics without serializing file contents or unlock codes", operation => {
  vi.stubGlobal("window", undefined);
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  logFailure(operation, new Error("private-file-content and recovery-code"));
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({ app: "drip", event: "operation_failed", operation, kind: "unexpected" });
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/private-file-content|recovery-code/);
});

it("classifies nested causes without serializing secret-bearing errors or metadata", () => {
  vi.stubGlobal("window", undefined);
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = new Error("password=do-not-log; balance=12345; postgres://secret", { cause: { code: "42703", query: "private SQL", detail: "private account" } });
  const reference = "11111111-1111-4111-8111-111111111111";
  logFailure("auth", failure, { status: 503, requestId: reference, durationMs: 1.6, password: "not-allowed" } as any);
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({ app: "drip", event: "operation_failed", operation: "auth", kind: "schema_mismatch", status: 503, requestId: reference, durationMs: 2 });
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/do-not-log|12345|postgres|secret|private|not-allowed/);
});

it("bounds cause traversal and distinguishes cancellations, storage and connectivity failures", () => {
  expect(errorKind(new Error("wrapped", { cause: { code: "ECONNREFUSED" } }))).toBe("database_unavailable");
  expect(errorKind({ message: "Database schema mismatch" })).toBe("schema_mismatch");
  expect(errorKind({ code: "42P01" })).toBe("schema_mismatch");
  expect(errorKind({ name: "QuotaExceededError" })).toBe("storage_full");
  expect(errorKind({ name: "AbortError" })).toBe("cancelled");
  expect(errorKind({ name: "NotAllowedError" })).toBe("cancelled");
  expect(errorKind(new TypeError("Failed to fetch"))).toBe("network");
  expect(errorKind(new TypeError("a render bug"))).toBe("unexpected");
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  expect(errorKind(cycle)).toBe("unexpected");
  expect(errorKind("private rejection string")).toBe("unexpected");
});

it("drops unsafe correlation values and tolerates a broken console", () => {
  vi.stubGlobal("window", undefined);
  const output = vi.spyOn(console, "warn").mockImplementation(() => {});
  logFailure("recovery", undefined, { status: 401, requestId: "password=secret\nforged", durationMs: Infinity });
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({ app: "drip", event: "operation_failed", operation: "recovery", kind: "unexpected", status: 401 });
  vi.spyOn(console, "error").mockImplementation(() => { throw new Error("console failed"); });
  expect(() => logFailure("cloud", new Error("secret"), { status: 999 })).not.toThrow();
  expect(() => logFailure("cloud", { get code() { throw new Error("getter failed"); } })).not.toThrow();
  expect(() => logFailure("private arbitrary string" as any)).not.toThrow();
});

it("deduplicates repeated browser failures and ignores deliberate cancellations", () => {
  vi.stubGlobal("window", {});
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
  logFailure("app.render", new Error("private")); logFailure("app.render", new Error("private again"));
  logFailure("app.unhandled", { name: "NotAllowedError" });
  expect(output).toHaveBeenCalledOnce();
  now.mockReturnValue(161_000); logFailure("app.render", new Error("private"));
  expect(output).toHaveBeenCalledTimes(2);
});

it("shows only validated references alongside a safe user message", () => {
  const reference = "11111111-1111-4111-8111-111111111111";
  expect(responseError(new Response(null, { headers: { "x-drip-request-id": reference } }), "Try again.").message).toBe(`Try again. Reference: ${reference}.`);
  expect(responseError(new Response(null, { headers: { "x-drip-request-id": "sensitive" } }), "Try again.").message).toBe("Try again.");
  expect(requestReference(null)).toBeUndefined();
});
