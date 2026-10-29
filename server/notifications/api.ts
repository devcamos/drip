import { randomUUID, timingSafeEqual } from "node:crypto";
import { dateInZone } from "@/lib/payment-reminders";
import type { PushConfig } from "./config";
import { dispatchReminders, providerStatus, type PushSender } from "./dispatch";
import { devicePattern, registrationSchema, ReminderError } from "./model";
import type { ReminderStore } from "./store";

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
export type ReminderDependencies = {
  config: () => PushConfig | null;
  origin: () => string;
  session: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  store: (config: PushConfig) => ReminderStore;
  sender: (config: PushConfig) => PushSender;
  now?: () => Date;
};
async function rejectOversize(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<never> {
  await reader.cancel();
  throw new ReminderError("Reminder information is too large.", 413);
}
async function readBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ReminderError("Use a JSON request.", 415);
  const limit = 64_000;
  if (Number(request.headers.get("content-length")) > limit) throw new ReminderError("Reminder information is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ReminderError("Missing reminder information.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) return rejectOversize(reader);
    chunks.push(next.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReminderError("Invalid reminder information.", 400); }
}
async function run(operation: string, work: () => Response | Promise<Response>) {
  try { return await work(); }
  catch (error) {
    if (error instanceof ReminderError) return reply({ error: error.message }, error.status);
    const reference = randomUUID();
    // Never log request payloads, URLs, subscription keys, SQL or raw provider errors.
    console.error(JSON.stringify({ event: "drip.reminders.error", operation, reference }));
    return reply({ error: "Phone reminders are unavailable. Try again later.", reference }, 503);
  }
}

export function reminderApi(deps: ReminderDependencies) {
  const now = () => deps.now?.() ?? new Date();
  async function context(request: Request, write: boolean) {
    if (write && request.headers.get("origin") !== deps.origin()) throw new ReminderError("Invalid origin.", 403);
    const session = await deps.session(request.headers);
    if (!session?.user.id || request.headers.get("x-drip-owner") !== session.user.id) throw new ReminderError("Sign in to manage reminders.", 401);
    const device = request.headers.get("x-drip-device");
    if (!device || !devicePattern.test(device)) throw new ReminderError("Reload Drip to identify this device.", 400);
    const config = deps.config();
    if (!config) throw new ReminderError("Phone reminders are not available on this deployment yet.", 503);
    return { owner: session.user.id, device: device.toLowerCase(), config, store: deps.store(config) };
  }
  return {
    config: () => run("configuration", () => { const config = deps.config(); return reply(config ? { available: true, publicKey: config.publicKey, workerVersion: 4, dailyWindow: "09:00–10:00 UTC" } : { available: false }); }),
    GET: (request: Request) => run("status", async () => { const c = await context(request, false); return reply({ enabled: !!await c.store.current(c.owner, c.device) }); }),
    PUT: (request: Request) => run("subscribe", async () => {
      const c = await context(request, true);
      // model.ts defines the strict transport/key/date schemas; reject before persistence.
      const parsed = registrationSchema.safeParse(await readBody(request));
      if (!parsed.success) throw new ReminderError("Invalid notification address or payment schedule.", 400);
      await c.store.save(c.owner, c.device, parsed.data.subscription, parsed.data.schedule, now());
      return reply({ enabled: true });
    }),
    DELETE: (request: Request) => run("unsubscribe", async () => { const c = await context(request, true); await c.store.remove(c.owner, c.device); return reply({ enabled: false }); }),
    test: (request: Request) => run("test", async () => {
      const c = await context(request, true), row = await c.store.current(c.owner, c.device);
      if (!row) throw new ReminderError("Turn on phone reminders first.", 409);
      if (!await c.store.allowTest(row, now())) throw new ReminderError("Wait a minute before sending another test.", 429);
      try { await deps.sender(c.config)(c.store.subscription(row), { type: "notification-test", date: dateInZone(now(), row.schedule.timeZone) }); }
      catch (error) { if ([404, 410].includes(providerStatus(error) ?? 0)) { await c.store.expired(row); return reply({ error: "This notification address has expired. Turn reminders on again.", code: "PUSH_SUBSCRIPTION_EXPIRED" }, 410); } throw error; }
      return reply({ accepted: true });
    }),
    cron: (request: Request) => run("dispatch", async () => {
      const config = deps.config();
      const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${config?.cronSecret ?? ""}`);
      if (!config || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ReminderError("Unauthorized.", 401);
      const result = await dispatchReminders(deps.store(config), deps.sender(config), now());
      console.info(JSON.stringify({ event: "drip.reminders.dispatched", ...result }));
      return reply(result, result.failed || result.deferred ? 503 : 200);
    }),
  };
}
