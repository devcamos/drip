import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("accepts app update/version messages only from its own origin", () => {
  const listeners = new Map<string, (event: any) => void>();
  const skipWaiting = vi.fn(); const postMessage = vi.fn();
  const origin = "https://drip.example";
  const self = { location: { origin }, skipWaiting, addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener) };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, importScripts: vi.fn() });
  const message = listeners.get("message")!;
  for (const untrusted of ["https://untrusted.example", "null", "", undefined]) {
    message({ origin: untrusted, data: { type: "SKIP_WAITING" } });
    message({ origin: untrusted, data: { type: "DRIP_WORKER_VERSION" }, ports: [{ postMessage }] });
  }
  expect(skipWaiting).not.toHaveBeenCalled(); expect(postMessage).not.toHaveBeenCalled();
  message({ origin, data: { type: "SKIP_WAITING" } });
  message({ origin, data: { type: "DRIP_WORKER_VERSION" }, ports: [{ postMessage }] });
  expect(skipWaiting).toHaveBeenCalledOnce(); expect(postMessage).toHaveBeenCalledWith({ version: 3 });
});

function shellWorker(release: string, windows: number, storage = new Map<string, Map<string, Response>>()) {
  const listeners = new Map<string, (event: any) => void>();
  const cache = (name: string) => {
    if (!storage.has(name)) storage.set(name, new Map());
    const records = storage.get(name)!;
    return {
      match: async (request: string | { url: string }) => records.get(typeof request === "string" ? request : new URL(request.url).pathname),
      put: async (request: string, response: Response) => { records.set(request, response); },
      addAll: async (requests: string[]) => { for (const path of requests) records.set(path, new Response(path)); },
    };
  };
  const clients = { matchAll: vi.fn().mockResolvedValue(Array.from({ length: windows }, () => ({}))), claim: vi.fn().mockResolvedValue(undefined) };
  const self = { DRIP_BUILD_ID: "", clients, location: { origin: "https://drip.example" }, addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener) };
  const fetcher = vi.fn().mockImplementation(async () => new Response(`<title>Drip</title><script src="/_next/static/${release}.js"></script>`));
  const imports = vi.fn().mockImplementation(() => { self.DRIP_BUILD_ID = release; });
  const caches = { keys: async () => [...storage.keys()], open: async (name: string) => cache(name), delete: async (name: string) => storage.delete(name) };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, caches, fetch: fetcher, URL, importScripts: imports });
  return { storage, fetcher, imports, clients, async event(name: string, fields = {}) {
    let work: Promise<any> | undefined;
    listeners.get(name)!({ ...fields, waitUntil: (p: Promise<any>) => { work = p; }, respondWith: (p: Promise<any>) => { work = p; } });
    return work ? await work : undefined;
  } };
}

it("refreshes the offline shell per build while retaining old immutable chunks for another open tab", async () => {
  const old = shellWorker("previous", 2);
  await old.event("install");
  expect(old.imports).toHaveBeenCalledWith("/sw-build.js");
  const current = shellWorker("current", 2, old.storage);
  await current.event("install"); await current.event("activate");
  expect([...current.storage.keys()]).toEqual(["drip-shell-previous", "drip-shell-current"]);
  expect(await current.storage.get("drip-shell-current")!.get("/")!.clone().text()).toContain("current.js");
  const response = await current.event("fetch", { request: { method: "GET", url: "https://drip.example/_next/static/previous.js" } });
  expect(await response.text()).toBe("/_next/static/previous.js");
  expect(current.fetcher).toHaveBeenCalledTimes(1); // Install only; old chunk stayed available offline.
  expect(await current.event("fetch", { request: { method: "GET", url: "https://drip.example/api/cloud" } })).toBeUndefined();
  expect(current.clients.claim).toHaveBeenCalledOnce();
  const single = shellWorker("latest", 1, current.storage);
  await single.event("install"); await single.event("activate");
  expect([...single.storage.keys()]).toEqual(["drip-shell-latest"]);
});

it("keeps the previous public shell when a new build cannot install", async () => {
  const old = shellWorker("working", 1); await old.event("install");
  const current = shellWorker("broken", 1, old.storage);
  current.fetcher.mockRejectedValueOnce(new Error("offline"));
  await expect(current.event("install")).rejects.toThrow("offline");
  expect(current.storage.get("drip-shell-working")?.has("/")).toBe(true);
  expect(current.clients.claim).not.toHaveBeenCalled();
});
