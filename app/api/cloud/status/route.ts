import { cloudConfigured } from "@/server/auth";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ available: cloudConfigured() }, { headers: { "Cache-Control": "no-store" } }); }
