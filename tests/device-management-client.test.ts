import { beforeEach, expect, it, vi } from "vitest";
const dependencies = vi.hoisted(() => ({ fetch: vi.fn(), session: vi.fn() }));
vi.mock("../lib/worker-safety", () => ({ safeFetch: dependencies.fetch }));
vi.mock("../lib/device-session", () => ({ readDeviceSession: dependencies.session }));
import { listSignedInDevices, signOutRemoteDevice } from "../lib/device-management";
import { passwordProof } from "../lib/password-crypto";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true }); dependencies.session.mockResolvedValue(undefined); dependencies.fetch.mockResolvedValue(Response.json({ devices: [] })); });
it.each([undefined, { signedOut: false, generation: "in" }, { signedOut: true, generation: "out" }])("sends only a normalized tag/proof and generation-bound request for %o", async gate => {
  dependencies.session.mockResolvedValueOnce(gate);
  const signal = new AbortController().signal;
  expect(await listSignedInDevices(" TeSTer ", "Exact password 42!", signal)).toEqual([]);
  const [path, request] = dependencies.fetch.mock.calls[0];
  expect(path).toBe("/api/auth/sign-in/gamertag-devices"); expect(request.cache).toBe("no-store"); expect(request.signal).toBe(signal);
  expect(JSON.parse(request.body)).toEqual({ username: "tester", proof: await passwordProof("tester", "Exact password 42!") }); expect(request.body).not.toContain("Exact password 42!");
  expect(request.headers[gate?.signedOut ? "X-Drip-Resume" : "X-Drip-Reconnect"]).toBe(gate?.generation ?? "initial");
});
it.each([[401, "incorrect"], [429, "Wait a minute"], [503, "Try again shortly"]])("maps HTTP%s to a safe error", async (status, message) => {
  dependencies.fetch.mockResolvedValueOnce(Response.json({ message: "private backend detail" }, { status }));
  await expect(listSignedInDevices("tester", "Synthetic password")).rejects.toThrow(message);
});
it("requires a connection and validates device responses instead of showing untrusted fields", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  await expect(listSignedInDevices("tester", "password")).rejects.toThrow(/Connect/); expect(dependencies.fetch).not.toHaveBeenCalled();
  vi.stubGlobal("navigator", { onLine: true });
  for (const value of [{}, { devices: [{ id: 42 }] }, { devices: [{ id: "a", name: "Safari", current: false, signedInAt: "invalid" }] }]) {
    dependencies.fetch.mockResolvedValueOnce(Response.json(value)); await expect(listSignedInDevices("tester", "password")).rejects.toThrow(/Could not read/);
  }
  const device = { id: "safe-id", name: "Safari on iPhone", current: true, signedInAt: "2026-10-29T12:00:00Z" };
  dependencies.fetch.mockResolvedValueOnce(Response.json({ devices: [device] })); expect(await listSignedInDevices("tester", "password")).toEqual([device]);
});
it("revokes only the selected session and requires an explicit acknowledgement", async () => {
  dependencies.fetch.mockResolvedValueOnce(Response.json({ removed: true, current: false }));
  expect(await signOutRemoteDevice("tester", "Synthetic password", "selected-session")).toEqual({ removed: true, current: false });
  expect(JSON.parse(dependencies.fetch.mock.calls[0][1].body).sessionId).toBe("selected-session");
  dependencies.fetch.mockResolvedValueOnce(Response.json({ removed: "yes" })); await expect(signOutRemoteDevice("tester", "password", "selected-session")).rejects.toThrow(/confirm/);
});
