export const feedbackAreas = ["accounts", "portfolio", "credit", "payments", "signin", "settings", "other"] as const;
export type FeedbackArea = typeof feedbackAreas[number];
export type FeedbackInput = { id: string; category: "bug" | "improvement"; area: FeedbackArea; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The server validates the complete allowlisted payload again before storage. */
export function parseFeedback(value: unknown): FeedbackInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || Object.keys(v).some(key => !["id", "category", "area", "message"].includes(key))) return null;
  if (typeof v.id !== "string" || !uuid.test(v.id) || (v.category !== "bug" && v.category !== "improvement") || !feedbackAreas.includes(v.area as FeedbackArea)) return null;
  if (typeof v.message !== "string" || v.message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.message)) return null;
  const message = v.message.replace(/\r\n?/g, "\n").trim();
  return message ? { id: v.id.toLowerCase(), category: v.category, area: v.area as FeedbackArea, message } : null;
}
