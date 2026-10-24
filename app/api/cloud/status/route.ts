import { cloudConfigured } from "@/server/auth";
import { withApiErrors } from "@/server/http-errors";
export const dynamic = "force-dynamic";
export function GET(request?: Request) { return withApiErrors("cloud.status", async () => Response.json({ available: cloudConfigured() }, { headers: { "Cache-Control": "no-store" } }), { code: "STATUS_UNAVAILABLE", message: "Could not check cloud availability." }, request); }
