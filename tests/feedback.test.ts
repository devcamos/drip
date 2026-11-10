import { expect, it, vi } from "vitest";
import { parseFeedback } from "../lib/feedback";
import { feedbackApi } from "../server/feedback/api";

const id = "9a64af0e-fbef-4e39-ac7e-4ef6927a53aa";
const valid = { id, category: "bug", area: "accounts", message: "  Card clipped\r\nwhen scrolling  " };
const request = (body: unknown = valid, overrides: Record<string, string> = {}) => new Request("https://drip.example/api/feedback", { method: "POST", headers: { origin: "https://drip.example", "content-type": "application/json", "x-drip-owner": "owner", ...overrides }, body: JSON.stringify(body) });
const setup = () => {
  const save = vi.fn().mockResolvedValue("saved");
  const session = vi.fn().mockResolvedValue({ user: { id: "owner" } });
  return { save, session, post: feedbackApi({ origin: () => "https://drip.example", session, save }) };
};

it("normalises text and accepts only an allowlisted payload", () => {
  expect(parseFeedback(valid)).toEqual({ ...valid, message: "Card clipped\nwhen scrolling" });
  expect(parseFeedback({ ...valid, balance: 100 })).toBeNull();
});
it("rejects unsupported types, areas, identifiers and empty messages", () => {
  for (const v of [null, [], { ...valid, category: "other" }, { ...valid, area: "private" }, { ...valid, id: "bad" }, { ...valid, message: " " }]) expect(parseFeedback(v)).toBeNull();
});
it("bounds messages and rejects unsupported control characters", () => {
  expect(parseFeedback({ ...valid, message: "x".repeat(5000) })).not.toBeNull();
  expect(parseFeedback({ ...valid, message: "x".repeat(5001) })).toBeNull();
  expect(parseFeedback({ ...valid, message: "a\u0000b" })).toBeNull();
});
it("rejects cross-origin and unauthenticated submissions before persistence", async () => {
  const { post, save, session } = setup();
  expect((await post(request(valid, { origin: "https://evil.example" }))).status).toBe(403);
  session.mockResolvedValueOnce(null); expect((await post(request())).status).toBe(401);
  expect((await post(request(valid, { "x-drip-owner": "other" }))).status).toBe(401); expect(save).not.toHaveBeenCalled();
});
it("validates content type, size and message before persistence", async () => {
  const { post, save } = setup();
  expect((await post(request(valid, { "content-type": "text/plain" }))).status).toBe(415);
  expect((await post(request({ ...valid, message: "x".repeat(24001) }))).status).toBe(413);
  expect((await post(request({ ...valid, message: "" }))).status).toBe(400); expect(save).not.toHaveBeenCalled();
});
it("acknowledges only saved or identical retried messages and returns no account details", async () => {
  const { post, save } = setup();
  const a = await post(request()); expect(a.status).toBe(200); expect(await a.json()).toEqual({ saved: true, reference: id });
  expect(save).toHaveBeenCalledWith("owner", expect.objectContaining({ message: "Card clipped\nwhen scrolling" }));
  save.mockResolvedValueOnce("retry"); expect((await post(request())).status).toBe(200);
});
it("reports quota, conflicts and backend failure without exposing message or database details", async () => {
  const { post, save } = setup(); save.mockResolvedValueOnce("limited").mockResolvedValueOnce("conflict").mockRejectedValueOnce(new Error("sensitive database detail"));
  expect((await post(request())).status).toBe(429); expect((await post(request())).status).toBe(409);
  const log = vi.spyOn(console, "error").mockImplementation(() => {}); const response = await post(request());
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("sensitive database detail"); expect(JSON.stringify(log.mock.calls)).not.toContain("Card clipped"); log.mockRestore();
});
