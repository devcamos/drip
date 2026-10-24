import { incidentQueue } from "@/server/incident-queue";
import { deliverIncident, retryIncident } from "@/server/incident-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Deliberately outside withApiErrors: alert-delivery failures must not page
// themselves recursively. The queue retains/retries unsuccessful deliveries.
const consume = incidentQueue.handleCallback(deliverIncident, { retry: retryIncident });
export async function POST(request: Request) {
  // Public callers must not make the SDK buffer arbitrary-sized callback bodies.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing callback." }, { status: 400 });
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return Response.json({ error: "Callback too large." }, { status: 413 }); }
      parts.push(value);
    }
  } catch { return Response.json({ error: "Invalid callback." }, { status: 400 }); }
  return consume(new Request(request, { body: new Uint8Array(Buffer.concat(parts)).buffer }));
}
