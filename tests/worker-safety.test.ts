import { expect, it, vi } from "vitest";
import { requireSafeWorker, safeFetch } from "../lib/worker-safety";

it("gates notification mutations with the existing sign-out/generation lock while keeping public configuration accessible", async () => {
  const { setItem } = await import("../lib/db");
  const fetcher = vi.fn(async () => Response.json({ available: false })); vi.stubGlobal("fetch", fetcher);
  await setItem("deviceSession", { signedOut: true, generation: "out" });
  for (const path of ["subscription", "test"]) await expect(safeFetch(`/api/notifications/${path}`, { method: "POST" })).rejects.toThrow(/signed out/);
  await safeFetch("/api/notifications/config"); expect(fetcher).toHaveBeenCalledOnce();
  await setItem("deviceSession", { signedOut: false, generation: "new-owner" });
  await expect(safeFetch("/api/notifications/subscription", { method: "PUT", headers: { "X-Drip-Reconnect": "old-owner" } })).rejects.toThrow(/session changed/);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("shares a stable browser id across concurrent tabs and rechecks sign-out after identifying the browser", async () => {
  const db = await import("../lib/db");
  const ids = await Promise.all(Array.from({ length: 5 }, () => db.browserDeviceId()));
  expect(new Set(ids).size).toBe(1);
  await db.setItem("deviceSession", { signedOut: true, generation: "out" });
  expect(await db.browserDeviceId()).toBe(ids[0]);
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
  await safeFetch("/api/auth/sign-in/gamertag-key", { method: "POST", headers: { "X-Drip-Resume": "out" } });
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-Drip-Device")).toBe(ids[0]);
  let release!: (id: string) => void;
  vi.spyOn(db, "browserDeviceId").mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const result = safeFetch("/api/auth/sign-in/gamertag-key", { method: "POST", headers: { "X-Drip-Resume": "out" } }).catch(error => error);
  await vi.waitFor(() => expect(release).toBeDefined());
  await db.setItem("deviceSession", { signedOut: true, generation: "later-sign-out" });
  release(ids[0]);
  expect(await result).toEqual(expect.objectContaining({ message: expect.stringMatching(/session changed/) }));
  expect(fetcher).toHaveBeenCalledOnce();
});

it("permits only the reserved signup paths while retaining the signed-out gate", async () => {
  const { setItem } = await import("../lib/db");
  const fetcher = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
  await setItem("deviceSession", { signedOut: true, generation: "signup-generation", signupNonce: "signup-nonce" });
  const headers = { "X-Drip-Resume": "signup-generation", "X-Drip-Signup": "signup-nonce" };
  for (const path of ["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/gamertag-password"]) await safeFetch(path, { method: "POST", headers });
  await safeFetch("/api/cloud", { method: "PUT", headers });
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [path, method] of [["/api/auth/change-email", "POST"], ["/api/cloud", "DELETE"], ["/api/auth/get-session", "GET"]]) await expect(safeFetch(path, { method, headers })).rejects.toThrow(/Signup changed/);
  await expect(safeFetch("/api/auth/sign-up/email", { method: "POST", headers: { ...headers, "X-Drip-Signup": "stale" } })).rejects.toThrow(/Signup changed/);
  await setItem("deviceSession", { signedOut: true, generation: "another-tab", signupNonce: "signup-nonce" });
  await expect(safeFetch("/api/auth/sign-up/email", { method: "POST", headers })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("does not require a worker in server or fresh browser contexts", async () => {
  await expect(requireSafeWorker()).resolves.toBeUndefined();
  vi.stubGlobal("window", {}); vi.stubGlobal("navigator", {}); await expect(requireSafeWorker()).resolves.toBeUndefined();
  vi.stubGlobal("navigator", { serviceWorker: { controller: null } }); await expect(requireSafeWorker()).resolves.toBeUndefined();
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

it("blocks private requests when signed out and permits only explicit recovery-code resume", async () => {
  const { setItem } = await import("../lib/db");
  await setItem("deviceSession", { signedOut: true, generation: "out" });
  const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  await expect(safeFetch("/api/cloud")).rejects.toThrow(/signed out/);
  await expect(safeFetch("/api/auth/sign-in/email", { method: "POST" })).rejects.toThrow(/signed out/);
  await safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Resume": "out" } });
  await safeFetch(new Request("http://drip.local/api/auth/sign-out", { method: "POST" }));
  await safeFetch(new URL("http://drip.local/api/cloud/status"));
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("binds password sign-in to the signed-out generation and rejects stale password attempts", async () => {
  const { setItem } = await import("../lib/db");
  await setItem("deviceSession", { signedOut: true, generation: "out" });
  const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  await expect(safeFetch("/api/auth/sign-in/gamertag", { method: "POST" })).rejects.toThrow(/signed out/);
  await expect(safeFetch("/api/auth/sign-in/gamertag", { method: "POST", headers: { "X-Drip-Resume": "old" } })).rejects.toThrow(/changed/);
  await safeFetch("/api/auth/sign-in/gamertag", { method: "POST", headers: { "X-Drip-Resume": "out" } });
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["gamertag-devices", "gamertag-revoke-device"])("requires the current signed-out generation for device management (%s)", async path => {
  const { setItem } = await import("../lib/db"); await setItem("deviceSession", { signedOut: true, generation: "out" });
  const fetcher = vi.fn(async () => Response.json({ devices: [] })); vi.stubGlobal("fetch", fetcher);
  const url = `/api/auth/sign-in/${path}`;
  await expect(safeFetch(url, { method: "POST" })).rejects.toThrow(/signed out/);
  await expect(safeFetch(url, { method: "POST", headers: { "X-Drip-Resume": "old" } })).rejects.toThrow(/changed/);
  await safeFetch(url, { method: "POST", headers: { "X-Drip-Resume": "out" } }); expect(fetcher).toHaveBeenCalledOnce();
});
it("serializes private requests with sign-out through the browser's shared lock", async () => {
  const { setItem } = await import("../lib/db");
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, run: () => Promise<Response>) => { const next = tail.then(run, run); tail = next.catch(() => {}); return next; });
  vi.stubGlobal("navigator", { locks: { request } });
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(new Response("out"));
  vi.stubGlobal("fetch", fetcher);
  const signingIn = safeFetch("/api/auth/sign-in/email", { method: "POST" });
  await vi.waitFor(() => expect(finish).toBeDefined());
  await setItem("deviceSession", { signedOut: true, generation: "out" });
  const signingOut = safeFetch("/api/auth/sign-out", { method: "POST" });
  expect(fetcher).toHaveBeenCalledOnce();
  finish(new Response("in")); await signingIn; await signingOut;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledWith("drip-private-session", expect.any(Function));
});

it("ignores delayed sign-out from an old tab after another tab has resumed", async () => {
  const { setItem } = await import("../lib/db");
  await setItem("deviceSession", { signedOut: false, generation: "new" });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await safeFetch("/api/auth/sign-out", { method: "POST", headers: { "X-Drip-Signout": "old" } });
  expect(await response.json()).toMatchObject({ stale: true });
  await setItem("deviceSession", { signedOut: true, generation: "claimed-before-auth" });
  await safeFetch("/api/auth/sign-out", { method: "POST", headers: { "X-Drip-Signout": "old" } });
  await safeFetch("/api/auth/sign-out", { method: "POST", headers: { "X-Drip-Disconnect": "old" } });
  await expect(safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Resume": "old" } })).rejects.toThrow(/session changed/);
  expect(fetcher).not.toHaveBeenCalled();
});

it("binds queued cloud renewal to the locally unlocked device generation", async () => {
  const { setItem } = await import("../lib/db");
  const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  await setItem("deviceSession", { signedOut: false, generation: "unlocked" });
  await safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Reconnect": "unlocked" } });
  expect(fetcher).toHaveBeenCalledOnce();
  await setItem("deviceSession", { signedOut: true, generation: "signed-out" });
  await expect(safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Reconnect": "unlocked" } })).rejects.toThrow(/session changed/);
  await setItem("deviceSession", { signedOut: false, generation: "other-account" });
  await expect(safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Reconnect": "unlocked" } })).rejects.toThrow(/session changed/);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("permits a captured initial renewal only while the device still has no generation", async () => {
  const { setItem } = await import("../lib/db");
  const fetcher = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  const request = { method: "POST", headers: { "X-Drip-Reconnect": "initial" } };
  await safeFetch("/api/auth/sign-in/email", request);
  await setItem("deviceSession", { signedOut: false, generation: "another-account" });
  await expect(safeFetch("/api/auth/sign-in/email", request)).rejects.toThrow(/session changed/);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("rechecks a cloud renewal after waiting for the shared request lock", async () => {
  const { setItem } = await import("../lib/db");
  await setItem("deviceSession", { signedOut: false, generation: "unlocked" });
  let release!: () => void;
  vi.stubGlobal("navigator", { locks: { request: (_name: string, run: () => Promise<Response>) => new Promise<Response>((resolve, reject) => {
    release = () => { run().then(resolve, reject); };
  }) } });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const queued = safeFetch("/api/auth/sign-in/email", { method: "POST", headers: { "X-Drip-Reconnect": "unlocked" } });
  const result = queued.catch(error => error);
  await vi.waitFor(() => expect(release).toBeDefined());
  await setItem("deviceSession", { signedOut: true, generation: "later-sign-out" });
  release();
  expect(await result).toEqual(expect.objectContaining({ message: expect.stringMatching(/session changed/) }));
  expect(fetcher).not.toHaveBeenCalled();
});
