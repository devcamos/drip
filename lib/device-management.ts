import { loginTag, passwordProof } from "./password-crypto";
import { readDeviceSession } from "./device-session";
import { safeFetch } from "./worker-safety";

export type SignedInDevice = { id: string; name: string; signedInAt: string; current: boolean };
export class DeviceLimitReached extends Error {}
function validDevice(value: unknown): value is SignedInDevice {
  if (!value || typeof value !== "object") return false;
  const device = value as SignedInDevice;
  return typeof device.id === "string" && device.id.length > 0 && device.id.length <= 128 && typeof device.name === "string" && device.name.length <= 100 && typeof device.current === "boolean" && typeof device.signedInAt === "string" && Number.isFinite(Date.parse(device.signedInAt));
}
async function request(path: string, username: string, password: string, extra: object, signal?: AbortSignal) {
  if (!navigator.onLine) throw new Error("Connect to the internet to manage devices.");
  const before = await readDeviceSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (before?.signedOut) headers["X-Drip-Resume"] = before.generation;
  else headers["X-Drip-Reconnect"] = before?.generation ?? "initial";
  const response = await safeFetch(`/api/auth/sign-in/${path}`, { method: "POST", cache: "no-store", credentials: "same-origin", headers, signal, body: JSON.stringify({ username: loginTag(username), proof: await passwordProof(username, password), ...extra }) });
  if (response.status === 401) throw new Error("Gamertag or password is incorrect.");
  if (response.status === 429) throw new Error("Too many attempts. Wait a minute, then try again.");
  if (!response.ok) throw new Error("Could not manage devices. Try again shortly.");
  return response.json();
}
export async function listSignedInDevices(username: string, password: string, signal?: AbortSignal): Promise<SignedInDevice[]> {
  const value = await request("gamertag-devices", username, password, {}, signal);
  if (!Array.isArray(value?.devices) || !value.devices.every(validDevice)) throw new Error("Could not read signed-in devices. Try again.");
  return value.devices;
}
export async function signOutRemoteDevice(username: string, password: string, id: string, signal?: AbortSignal): Promise<{ removed: boolean; current: boolean }> {
  const value = await request("gamertag-revoke-device", username, password, { sessionId: id }, signal);
  if (typeof value.removed !== "boolean" || typeof value.current !== "boolean") throw new Error("Could not confirm device sign-out. Refresh devices.");
  return value;
}
