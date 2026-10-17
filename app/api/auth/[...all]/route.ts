import { getAuth, cloudConfigured } from "@/server/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  if (!cloudConfigured()) return Response.json({ error: "Cloud recovery is not configured." }, { status: 503 });
  const expected = request.headers.get("x-drip-owner");
  if (expected) {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.id !== expected) return Response.json({ error: "Cloud account changed. Sign in again." }, { status: 401 });
  }
  return getAuth().handler(request);
}
export { handler as GET, handler as POST };
