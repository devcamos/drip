import { cloudConfigured } from "@/server/auth";
import { withApiIncidents } from "@/server/incidents";
export const dynamic = "force-dynamic";
export const GET = withApiIncidents(() => Response.json({ available: cloudConfigured() }, { headers: { "Cache-Control": "no-store" } }));
