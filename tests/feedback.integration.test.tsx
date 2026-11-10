// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const dep = vi.hoisted(() => ({ readCloudState: vi.fn(), getItem: vi.fn(), safeFetch: vi.fn() }));
vi.mock("../lib/cloud", () => ({ readCloudState: dep.readCloudState }));
vi.mock("../lib/db", () => ({ getItem: dep.getItem }));
vi.mock("../lib/worker-safety", () => ({ safeFetch: dep.safeFetch }));
import { Feedback } from "../app/Feedback";

beforeEach(() => { vi.clearAllMocks(); dep.readCloudState.mockResolvedValue({ userId: "owner" }); dep.getItem.mockResolvedValue({ signedOut: false, generation: "device" }); });
it("submits only the selected fields, shows privacy information and confirms after an accepted receipt", async () => {
  dep.safeFetch.mockImplementation(async (_url, init) => { const body = JSON.parse(init.body); return Response.json({ saved: true, reference: body.id }); });
  render(<Feedback onBack={vi.fn()} />);
  expect(screen.getByText(/authorised agents can read/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Which area?"), { target: { value: "portfolio" } });
  fireEvent.change(screen.getByLabelText("Your feedback"), { target: { value: "Show income per stock" } });
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  expect(await screen.findByText("Your message was saved for the Drip team to review.")).toBeVisible();
  const payload = JSON.parse(dep.safeFetch.mock.calls[0][1].body);
  expect(payload).toEqual({ id: expect.any(String), category: "improvement", area: "portfolio", message: "Show income per stock" });
  expect(dep.safeFetch.mock.calls[0][1].headers["X-Drip-Owner"]).toBe("owner");
});
it("preserves text and reuses its reference after an uncertain failure, without claiming success", async () => {
  dep.safeFetch.mockRejectedValueOnce(new Error("Offline")).mockImplementationOnce(async (_url, init) => Response.json({ saved: true, reference: JSON.parse(init.body).id }));
  render(<Feedback onBack={vi.fn()} />); fireEvent.change(screen.getByLabelText("Your feedback"), { target: { value: "A report" } });
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" })); expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByLabelText("Your feedback")).toHaveValue("A report"); expect(screen.queryByText("Thanks for your feedback")).toBeNull();
  const first = JSON.parse(dep.safeFetch.mock.calls[0][1].body).id;
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  await waitFor(() => expect(screen.getByText("Thanks for your feedback")).toBeVisible());
  expect(JSON.parse(dep.safeFetch.mock.calls[1][1].body).id).toBe(first);
});
