import { expect, it, vi } from "vitest";
import { requireSafeWorker, safeFetch } from "../lib/worker-safety";

it("does not require a worker in server or fresh browser contexts", async () => {
  await requireSafeWorker();
  vi.stubGlobal("window", {}); vi.stubGlobal("navigator", {}); await requireSafeWorker();
  vi.stubGlobal("navigator", { serviceWorker: { controller: null } }); await requireSafeWorker();
});
it("blocks auth/private fetches under a legacy cache-everything worker", async () => {
  vi.stubGlobal("window", {}); vi.stubGlobal("navigator", { serviceWorker: { controller: { postMessage() {} } } });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(safeFetch("/api/auth/get-session")).rejects.toThrow("app update is required");
  expect(fetcher).not.toHaveBeenCalled();
});
it("permits verified workers and rechecks after the controller changes", async () => {
  vi.stubGlobal("window", {});
  const controller = { postMessage: vi.fn((_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ version: 3 })) };
  vi.stubGlobal("navigator", { serviceWorker: { controller } });
  const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  await safeFetch("/api/cloud"); await safeFetch("/api/cloud");
  expect(controller.postMessage).toHaveBeenCalledTimes(1);
  const old = { postMessage: (_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ version: 2 }) };
  vi.stubGlobal("navigator", { serviceWorker: { controller: old } });
  await expect(safeFetch("/api/cloud")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
