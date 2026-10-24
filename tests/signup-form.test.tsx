// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SignupForm } from "../app/SignupForm";
function fill() {
  fireEvent.change(screen.getByLabelText(/Gamertag/), { target: { value: "new_person" } });
  fireEvent.change(screen.getByLabelText("Create password"), { target: { value: "Synthetic meadow 2026!" } });
  fireEvent.change(screen.getByLabelText("Confirm new account password"), { target: { value: "Synthetic meadow 2026!" } });
}
it("explains why confirmation blocks signup and clears the hint when corrected", () => {
  render(<SignupForm onCreate={vi.fn()} />); fill();
  const confirmation = screen.getByLabelText("Confirm new account password");
  fireEvent.change(confirmation, { target: { value: "A different password!" } });
  expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  expect(confirmation).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  fireEvent.change(confirmation, { target: { value: "Synthetic meadow 2026!" } });
  expect(screen.queryByText("Passwords do not match.")).toBeNull();
  expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
});
it("requires explicit retained-account consent and keeps entered values on failure for retry", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("Your current account has unsynced changes")).mockResolvedValueOnce(undefined);
  render(<SignupForm replaceExisting onCreate={create} />); fill();
  expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unsynced changes");
  expect(screen.getByLabelText(/Gamertag/)).toHaveValue("new_person"); expect(screen.getByLabelText("Create password")).toHaveValue("Synthetic meadow 2026!");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByLabelText("Create password")).toHaveValue(""));
});
it("waits for signup and prevents duplicate submissions without introducing a recovery step", async () => {
  let resolve!: () => void;
  const create = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  render(<SignupForm onCreate={create} />); fill();
  fireEvent.submit(screen.getByRole("form", { name: "Sign up" }));
  expect(screen.getByRole("button", { name: "Creating account…" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "Sign up" })); expect(create).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText(/Recovery code/)).toBeNull();
  await act(async () => { resolve(); }); expect(screen.getByLabelText("Create password")).toHaveValue("");
});
