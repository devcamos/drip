import { expect, test } from "vitest";
import { emptyFeedbackDraft, validateFeedbackDraft } from "../app/prototype/feedback/feedback-model";

const bug = { ...emptyFeedbackDraft(), area: "accounts", description: "  The card does not open.\r\nPlease check.  ", reproduction: " Tap the card ", expected: " Show details " };

test("normalises a problem report and preserves its chosen screen and optional details", () => {
  expect(validateFeedbackDraft(bug)).toEqual({ errors: {}, message: { category: "bug", area: "accounts", description: "The card does not open.\nPlease check.", reproduction: "Tap the card", expected: "Show details" } });
});

test("an improvement drops hidden problem-only details without losing the idea", () => {
  const result = validateFeedbackDraft({ ...bug, category: "improvement", description: "Let me filter the calendar." });
  expect(result.message).toMatchObject({ category: "improvement", description: "Let me filter the calendar.", reproduction: null, expected: null });
});

test("unknown message shapes and feedback categories never become a valid message", () => {
  for (const value of [null, [], "text", { ...bug, category: "incident" }, { ...bug, category: null }]) {
    const result = validateFeedbackDraft(value); expect(result.message).toBeUndefined(); expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  }
});

test("the description is required text while unused optional details can be empty", () => {
  for (const description of ["", " \r\n ", undefined, null, 123]) expect(validateFeedbackDraft({ ...bug, description }).errors.description).toBeDefined();
  expect(validateFeedbackDraft({ ...bug, reproduction: "", expected: " " }).message).toMatchObject({ reproduction: null, expected: null });
  expect(validateFeedbackDraft({ ...bug, reproduction: 10 }).errors.reproduction).toBeDefined();
  expect(validateFeedbackDraft({ ...bug, expected: null }).errors.expected).toBeDefined();
});

test("each text limit accepts its boundary and rejects an oversized field", () => {
  for (const [key, limit] of [["description", 5000], ["reproduction", 3000], ["expected", 2000]] as const) {
    expect(validateFeedbackDraft({ ...bug, [key]: "a".repeat(limit) }).message).toBeDefined();
    expect(validateFeedbackDraft({ ...bug, [key]: "a".repeat(limit + 1) }).errors[key]).toContain(limit.toLocaleString("en-GB"));
  }
});

test("control characters are rejected and untrusted markup remains ordinary message text", () => {
  for (const key of ["description", "reproduction", "expected"] as const) expect(validateFeedbackDraft({ ...bug, [key]: "bad\u0000text" }).errors[key]).toBeDefined();
  const description = "<script>example()</script> [a link](https://example.com)";
  expect(validateFeedbackDraft({ ...bug, description }).message?.description).toBe(description);
});

test("context is allowlisted and unrelated private fields cannot enter the message", () => {
  const before = structuredClone(bug);
  for (const area of ["/accounts?id=private", "//example.com", "rampage201", undefined]) expect(validateFeedbackDraft({ ...bug, area }).errors.area).toBeDefined();
  for (const key of ["gamertag", "balance", "recoveryCode", "sessionToken"]) expect(validateFeedbackDraft({ ...bug, [key]: "not part of feedback" }).errors.form).toBeDefined();
  validateFeedbackDraft(bug); expect(bug).toEqual(before);
});
