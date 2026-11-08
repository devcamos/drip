// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import WelcomePrototype from "../app/prototype/welcome/WelcomePrototype";
import FeedbackPrototype from "../app/prototype/feedback/FeedbackPrototype";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

test("feedback works before sign-in, retains a same-page draft and only previews a receipt without sending or storing data", async () => {
  const user = userEvent.setup(), fetcher = vi.fn(), writes = vi.spyOn(Storage.prototype, "setItem"); vi.stubGlobal("fetch", fetcher);
  render(<WelcomePrototype />);
  const trigger = screen.getByRole("button", { name: "Give feedback" }); await user.click(trigger);
  let dialog = screen.getByRole("dialog", { name: "Give feedback" });
  await user.click(within(dialog).getByRole("button", { name: "Review message" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Tell us what happened");
  fireEvent.change(within(dialog).getByLabelText("What happened?"), { target: { value: "<script>example()</script> The card did not open." } });
  await user.selectOptions(within(dialog).getByLabelText("Which part of Drip?"), "accounts");
  await user.click(within(dialog).getByText("Add more detail"));
  await user.type(within(dialog).getByLabelText("Steps to reproduce"), "Tap the card");
  await user.click(within(dialog).getByRole("button", { name: "Close feedback" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger); dialog = screen.getByRole("dialog", { name: "Give feedback" });
  expect(within(dialog).getByLabelText("What happened?")).toHaveValue("<script>example()</script> The card did not open.");
  await user.click(within(dialog).getByRole("button", { name: "Review message" }));
  const preview = within(dialog).getByLabelText("Message preview");
  expect(preview).toHaveTextContent("<script>example()</script>"); expect(preview.querySelector("script, a")).toBeNull();
  expect(preview).toHaveTextContent("Accounts"); expect(preview).toHaveTextContent("Tap the card");
  await user.click(within(dialog).getByRole("button", { name: "Edit message" }));
  await user.click(within(dialog).getByRole("radio", { name: /Suggest an improvement/ }));
  expect(within(dialog).queryByText("Add more detail")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Review message" }));
  expect(within(dialog).getByLabelText("Message preview")).not.toHaveTextContent("Tap the card");
  await user.click(within(dialog).getByRole("button", { name: "Preview confirmation" }));
  expect(within(dialog).getByLabelText("Sample feedback receipt")).toHaveTextContent("No message has been saved or sent");
  await user.click(within(dialog).getByRole("button", { name: "Try another message" }));
  expect(within(dialog).getByLabelText("What happened?")).toHaveValue("");
  fireEvent(dialog, new Event("cancel", { bubbles: false })); expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
});

test("C4 views and failure scenarios explain proposed durable acceptance separately from the sample experience", async () => {
  const user = userEvent.setup(), fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); render(<FeedbackPrototype />);
  expect(screen.getByLabelText("C4 context diagram")).toHaveTextContent("Nexus reviewer");
  expect(screen.getByText("Proposed · Services not connected")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "C4 containers" }));
  expect(screen.queryByLabelText("C4 context diagram")).toBeNull();
  expect(screen.getByLabelText("C4 container diagram")).toHaveTextContent("Feedback store");
  expect(screen.getByLabelText("C4 container diagram")).toHaveTextContent("Separate from Drip’s financial vault");
  await user.click(screen.getByRole("button", { name: "Notion unavailable" }));
  expect(screen.getByRole("heading", { name: "Saved, waiting for delivery." })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "No connection" }));
  expect(screen.getByText(/must not say the message was received/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Normal delivery" }));
  expect(screen.getByRole("heading", { name: "Saved first, then delivered." })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try feedback" }));
  expect(screen.queryByLabelText("Proposed feedback architecture")).toBeNull();
  expect(screen.getByRole("heading", { name: "Help shape Drip." })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "C4 diagrams" }));
  expect(screen.getByLabelText("C4 context diagram")).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});
