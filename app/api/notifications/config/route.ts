import { notifications } from "@/server/notifications/runtime";
import { withApiIncidents } from "@/server/incidents";
export const dynamic = "force-dynamic";
export const GET = withApiIncidents(notifications.config);
