import type { PoolClient } from "@neondatabase/serverless";

type SessionRow = { id: string; dripDeviceId: string | null; userAgent: string | null; createdAt: Date | string };
export function deviceName(ua = "") {
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let platform = "Unknown device";
  if (/iPad/.test(ua)) platform = "iPad";
  else if (/iPhone/.test(ua)) platform = "iPhone";
  else if (/Android/.test(ua)) platform = "Android";
  else if (/Windows/.test(ua)) platform = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) platform = "Mac";
  else if (/Linux/.test(ua)) platform = "Linux";
  return browser === "Browser" && platform === "Unknown device" ? "Unknown browser" : `${browser} on ${platform}`;
}
export async function signedInDevices(client: PoolClient, owner: string, currentDevice: string) {
  const { rows } = await client.query<SessionRow>('SELECT id, "dripDeviceId", "userAgent", "createdAt" FROM "session" WHERE "userId" = $1 AND "expiresAt" > now() ORDER BY "createdAt" DESC, id', [owner]);
  // Never return bearer tokens, IP addresses or raw user-agent strings.
  return rows.map(row => ({ id: row.id, name: deviceName(row.userAgent ?? undefined), signedInAt: new Date(row.createdAt).toISOString(), current: row.dripDeviceId === currentDevice }));
}
export async function revokeDevice(client: PoolClient, owner: string, id: string, currentDevice: string) {
  const { rows } = await client.query<{ dripDeviceId: string | null }>('SELECT "dripDeviceId" FROM "session" WHERE "userId" = $1 AND id = $2 AND "expiresAt" > now()', [owner, id]);
  if (!rows.length) return { removed: false, current: false };
  const device = rows[0].dripDeviceId;
  // Revoke all tokens for this browser; legacy sessions have no browser UUID.
  if (device) await client.query('DELETE FROM "session" WHERE "userId" = $1 AND "dripDeviceId" = $2', [owner, device]);
  else await client.query('DELETE FROM "session" WHERE "userId" = $1 AND id = $2', [owner, id]);
  return { removed: true, current: device === currentDevice };
}
