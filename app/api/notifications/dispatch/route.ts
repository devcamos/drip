import { notifications } from "@/server/notifications/runtime";
import { withApiIncidents } from "@/server/incidents";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = withApiIncidents(notifications.cron);
