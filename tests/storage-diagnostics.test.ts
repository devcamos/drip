import { afterEach, expect, it, vi } from "vitest";
import { localVaultStatus } from "../lib/db";

afterEach(() => vi.restoreAllMocks());

it("logs only an allowlisted category when IndexedDB returns sensitive error details", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(indexedDB, "open").mockImplementationOnce(() => {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => {
      Object.defineProperty(request, "error", { value: new DOMException("private-password account-name balance=12345", "QuotaExceededError") });
      request.onerror?.call(request, new Event("error"));
    });
    return request;
  });
  await expect(localVaultStatus()).rejects.toThrow(/^Could not open local storage\.$/);
  expect(output).toHaveBeenCalledOnce();
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({ app: "drip", event: "operation_failed", operation: "storage.open", kind: "storage_full" });
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/private-password|account-name|12345/);
});
