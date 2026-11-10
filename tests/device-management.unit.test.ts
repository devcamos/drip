import { beforeEach, expect, it, vi } from "vitest";
const dep = vi.hoisted(() => ({ fetch: vi.fn(), session: vi.fn(), proof: vi.fn() }));
vi.mock("../lib/worker-safety", () => ({ safeFetch: dep.fetch }));
vi.mock("../lib/device-session", () => ({ readDeviceSession: dep.session }));
vi.mock("../lib/password-crypto", async original => ({ ...await original<typeof import("../lib/password-crypto")>(), passwordProof: dep.proof }));
import { listSignedInDevices, signOutRemoteDevice } from "../lib/device-management";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true }); dep.session.mockResolvedValue({ signedOut: false, generation: "device-generation" }); dep.proof.mockResolvedValue("derived-proof"); });
it("requires connectivity before sending credentials or reading a session", async () => {
  vi.stubGlobal("navigator", { onLine: false }); await expect(listSignedInDevices("test", "private password")).rejects.toThrow(/Connect/);
  expect(dep.session).not.toHaveBeenCalled(); expect(dep.proof).not.toHaveBeenCalled(); expect(dep.fetch).not.toHaveBeenCalled();
});
it("sends a normalized gamertag and derived proof bound to the current device generation", async () => {
  dep.fetch.mockResolvedValueOnce(Response.json({ devices: [] })); await expect(listSignedInDevices(" Test_User ", "private password")).resolves.toEqual([]);
  const [url, request] = dep.fetch.mock.calls[0]; expect(url).toBe("/api/auth/sign-in/gamertag-devices");
  expect(request.headers["X-Drip-Reconnect"]).toBe("device-generation"); expect(request.body).not.toContain("private password");
  expect(JSON.parse(request.body)).toEqual({ username: "test_user", proof: "derived-proof" });
});
it("uses the signed-out generation when reopening device management", async () => {
  dep.session.mockResolvedValueOnce({ signedOut: true, generation: "signed-out-generation" }); dep.fetch.mockResolvedValueOnce(Response.json({ devices: [] }));
  await listSignedInDevices("test", "password"); expect(dep.fetch.mock.calls[0][1].headers["X-Drip-Resume"]).toBe("signed-out-generation");
});
it("rejects malformed device records without rendering untrusted server values", async () => {
  for (const devices of [null, [{}], [{ id: "x", name: "iPhone", current: false, signedInAt: "bad date" }], [{ id: "x".repeat(129), name: "iPhone", current: false, signedInAt: "2026-10-29T12:00:00Z" }]]) {
    dep.fetch.mockResolvedValueOnce(Response.json({ devices })); await expect(listSignedInDevices("test", "password")).rejects.toThrow(/Could not read/);
  }
});
it("maps credential and rate-limit failures to safe user messages", async () => {
  for (const [status, text] of [[401, "incorrect"], [429, "Wait a minute"], [503, "Try again shortly"]] as const) {
    dep.fetch.mockResolvedValueOnce(Response.json({ message: "private server details" }, { status })); await expect(listSignedInDevices("test", "password")).rejects.toThrow(text);
  }
});
it("revokes only the chosen session and requires boolean confirmation", async () => {
  dep.fetch.mockResolvedValueOnce(Response.json({ removed: true, current: false }));
  await expect(signOutRemoteDevice("test", "password", "chosen-session")).resolves.toEqual({ removed: true, current: false });
  expect(JSON.parse(dep.fetch.mock.calls[0][1].body).sessionId).toBe("chosen-session");
  dep.fetch.mockResolvedValueOnce(Response.json({ removed: "yes", current: false })); await expect(signOutRemoteDevice("test", "password", "chosen-session")).rejects.toThrow(/Could not confirm/);
});
