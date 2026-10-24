import { afterEach, beforeEach, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("../server/incident-queue", () => ({ incidentQueue: { handleCallback: () => queue.consume } }));
import { POST } from "../app/api/queues/incidents/route";
beforeEach(() => queue.consume.mockReset().mockResolvedValue(Response.json({ status: "success" })));
afterEach(() => vi.restoreAllMocks());
it("bounds streamed bodies before the queue SDK, even without Content-Length", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); } });
  const request = new Request("https://drip.example/api/queues/incidents", { method: "POST", body, duplex: "half" } as RequestInit);
  expect((await POST(request)).status).toBe(413); expect(queue.consume).not.toHaveBeenCalled();
});
it("rejects missing and broken callback bodies without invoking the consumer", async () => {
  expect((await POST(new Request("https://drip.example/api/queues/incidents", { method: "POST" }))).status).toBe(400);
  const body = new ReadableStream({ start(controller) { controller.error(new Error("private stream failure")); } });
  const response = await POST(new Request("https://drip.example/api/queues/incidents", { method: "POST", body, duplex: "half" } as RequestInit));
  expect(response.status).toBe(400); expect(JSON.stringify(await response.json())).not.toContain("private");
  expect(queue.consume).not.toHaveBeenCalled();
});
it("preserves CloudEvent headers and forwards a small callback to the SDK", async () => {
  const request = new Request("https://drip.example/api/queues/incidents", { method: "POST", headers: { "ce-type": "fixture" }, body: "{}" });
  expect((await POST(request)).status).toBe(200); expect(queue.consume).toHaveBeenCalledOnce();
  const forwarded = queue.consume.mock.calls[0][0] as Request;
  expect(forwarded.headers.get("ce-type")).toBe("fixture"); expect(await forwarded.text()).toBe("{}");
});
