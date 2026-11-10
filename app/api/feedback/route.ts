import { authBaseURL } from "@/scripts/deployment-config.mjs";
import { cloudConfigured, database, getAuth } from "@/server/auth";
import { feedbackApi } from "@/server/feedback/api";
import { saveFeedback } from "@/server/feedback/store";
import type { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = feedbackApi({
  origin: () => new URL(authBaseURL(process.env)!).origin,
  session: headers => cloudConfigured() ? getAuth().api.getSession({ headers }) : Promise.resolve(null),
  save: (owner, input) => saveFeedback(database() as unknown as Pool, owner, input),
});
