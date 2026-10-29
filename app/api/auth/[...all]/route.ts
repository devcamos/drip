import { getAuth, cloudConfigured } from "@/server/auth";
import { guardDeviceAuthResponse } from "@/server/device-sessions";
import { authBaseURL } from "@/scripts/deployment-config.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function boundedPasswordRequest(request: Request): Promise<Request | Response> {
  if (request.headers.get("origin") !== new URL(authBaseURL(process.env) ?? request.url).origin) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const reader = request.body?.getReader(); if (!reader) return Response.json({ error: "Missing body." }, { status: 400 });
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 4096) { await reader.cancel(); return Response.json({ error: "Request too large." }, { status: 413 }); }
    chunks.push(value);
  }
  return new Request(request, { method: "POST", body: new Uint8Array(Buffer.concat(chunks)).buffer });
}
async function handler(request: Request) {
  if (!cloudConfigured()) return Response.json({ error: "Cloud recovery is not configured." }, { status: 503 });
  const path = new URL(request.url).pathname;
  if (request.method === "POST" && ["/api/auth/sign-in/gamertag", "/api/auth/sign-in/gamertag-key", "/api/auth/gamertag-password", "/api/auth/sign-in/gamertag-devices", "/api/auth/sign-in/gamertag-revoke-device"].includes(path)) {
    const bounded = await boundedPasswordRequest(request);
    if (bounded instanceof Response) return bounded;
    request = bounded;
  }
  const expected = request.headers.get("x-drip-owner");
  if (expected) {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.id !== expected) return Response.json({ error: "Cloud account changed. Sign in again." }, { status: 401 });
  }
  return guardDeviceAuthResponse(() => getAuth().handler(request));
}
export { handler as GET, handler as POST };
