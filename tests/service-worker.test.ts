import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("accepts app update/version messages only from its own origin", () => {
  const listeners = new Map<string, (event: any) => void>();
  const skipWaiting = vi.fn(); const postMessage = vi.fn();
  const origin = "https://drip.example";
  const self = { location: { origin }, skipWaiting, addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener) };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self });
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
