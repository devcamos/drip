export const feedbackAreas = ["general", "signin", "accounts", "stock"] as const;
export const areaLabels = { general: "General", signin: "Sign in", accounts: "Accounts", stock: "Stock detail" } as const;
export type FeedbackArea = typeof feedbackAreas[number];
export type FeedbackDraft = { category: "bug" | "improvement"; description: string; reproduction: string; expected: string; area: FeedbackArea };
export type FeedbackMessage = { category: FeedbackDraft["category"]; description: string; reproduction: string | null; expected: string | null; area: FeedbackArea };
export type FeedbackErrors = Partial<Record<keyof FeedbackDraft | "form", string>>;
export const emptyFeedbackDraft = (): FeedbackDraft => ({ category: "bug", description: "", reproduction: "", expected: "", area: "general" });

/** Prototype-only message validation. The proposed API must validate independently. */
export function validateFeedbackDraft(value: unknown): { message?: FeedbackMessage; errors: FeedbackErrors } {
  const errors: FeedbackErrors = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: { form: "Choose a feedback type and write a message." } };
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["category", "description", "reproduction", "expected", "area"].includes(key))) return { errors: { form: "Only the feedback fields belong in this message." } };
  if (v.category !== "bug" && v.category !== "improvement") errors.category = "Choose a problem or an improvement.";
  if (!feedbackAreas.includes(v.area as FeedbackArea)) errors.area = "Choose a screen from the list.";
  function text(key: "description" | "reproduction" | "expected", maximum: number, required = false) {
    const raw = v[key];
    if (typeof raw !== "string") { errors[key] = "Enter text in this field."; return ""; }
    const normalized = raw.replace(/\r\n?/g, "\n").trim();
    if (required && !normalized) errors[key] = "Tell us what happened or what you would improve.";
    else if (raw.length > maximum) errors[key] = `Use ${maximum.toLocaleString("en-GB")} characters or fewer.`;
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) errors[key] = "Remove unsupported control characters.";
    return normalized;
  }
  const description = text("description", 5000, true);
  const reproduction = v.category === "bug" ? text("reproduction", 3000) || null : null;
  const expected = v.category === "bug" ? text("expected", 2000) || null : null;
  if (Object.keys(errors).length) return { errors };
  return { errors, message: { category: v.category as FeedbackDraft["category"], description, reproduction, expected, area: v.area as FeedbackArea } };
}
