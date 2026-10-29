import webPush from "web-push";
import { cloudConfigured, database, getAuth } from "@/server/auth";
import { reminderApi } from "./api";
import { pushConfig } from "./config";
import { authBaseURL } from "../../scripts/deployment-config.mjs";
import { ReminderStore } from "./store";

export const notifications = reminderApi({
  config: pushConfig,
  origin: () => new URL(authBaseURL(process.env)!).origin,
  session: headers => cloudConfigured() ? getAuth().api.getSession({ headers }) : Promise.resolve(null),
  store: config => new ReminderStore(database(), config.storageKey),
  sender: config => (subscription, payload) => webPush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: 6 * 60 * 60, timeout: 10_000, urgency: "normal",
  }),
});
