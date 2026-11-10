import { randomUUID } from "node:crypto";
import { parseFeedback, type FeedbackInput } from "@/lib/feedback";

type Deps = { origin: () => string; session: (headers: Headers) => Promise<{ user: { id: string } } | null>; save: (owner: string, input: FeedbackInput) => Promise<"saved" | "retry" | "conflict" | "limited"> };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function feedbackApi(deps: Deps) {
  return async (request: Request) => {
    try {
      if (request.headers.get("origin") !== deps.origin()) return reply({ error: "Invalid origin." }, 403);
      const session = await deps.session(request.headers);
      if (!session?.user.id || request.headers.get("x-drip-owner") !== session.user.id) return reply({ error: "Sign in to send feedback." }, 401);
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply({ error: "Use a JSON request." }, 415);
      if (Number(request.headers.get("content-length")) > 24_000 || !request.body) return reply({ error: "Feedback is too large." }, 413);
      const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 24_000) { await reader.cancel(); return reply({ error: "Feedback is too large." }, 413); } chunks.push(next.value); }
      let raw: unknown; try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ error: "Invalid feedback." }, 400); }
      const input = parseFeedback(raw); if (!input) return reply({ error: "Check the feedback fields and try again." }, 400);
      const result = await deps.save(session.user.id, input);
      if (result === "limited") return reply({ error: "Too many messages. Please try again later." }, 429);
      if (result === "conflict") return reply({ error: "This feedback reference is already in use. Edit the message and try again." }, 409);
      return reply({ saved: true, reference: input.id });
    } catch {
      const reference = randomUUID(); console.error(JSON.stringify({ event: "drip.feedback.error", reference }));
      return reply({ error: "Could not confirm your feedback was saved. Please retry.", reference }, 503);
    }
  };
}
