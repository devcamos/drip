// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ hasPasskeyUnlock: vi.fn(), enablePasskeyUnlock: vi.fn(), disablePasskeyUnlock: vi.fn() }));
vi.mock("../lib/passkey-unlock", () => actions);
import { PasskeyUnlock } from "../app/PasskeyUnlock";
beforeEach(() => {
  vi.clearAllMocks(); actions.hasPasskeyUnlock.mockResolvedValue(false);
  actions.enablePasskeyUnlock.mockResolvedValue(undefined); actions.disablePasskeyUnlock.mockResolvedValue(undefined);
});
it("sets up a saved passkey, clears the code only after verification, and removes the local wrapper", async () => {
  render(<PasskeyUnlock name="rampage201" />);
  const input = await screen.findByLabelText("Recovery code to set up passkey unlock");
  const setup = screen.getByRole("button", { name: "Set up passkey unlock" });
  expect(setup).toBeDisabled();
  fireEvent.change(input, { target: { value: "recovery" } });
  fireEvent.click(setup);
  expect(await screen.findByText(/Passkey saved and verified/)).toBeInTheDocument();
  expect(actions.enablePasskeyUnlock).toHaveBeenCalledWith("recovery", "rampage201");
  expect(screen.queryByLabelText("Recovery code to set up passkey unlock")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove passkey unlock" }));
  expect(await screen.findByText(/removed from this browser/)).toBeInTheDocument();
  expect(await screen.findByLabelText("Recovery code to set up passkey unlock")).toHaveValue("");
});
it("retains setup inputs after cancellation or unsupported encryption and allows retry", async () => {
  actions.enablePasskeyUnlock.mockRejectedValueOnce(new DOMException("Cancel", "NotAllowedError")).mockRejectedValueOnce(new Error("Encryption unsupported"));
  render(<PasskeyUnlock name="rampage201" />);
  const input = await screen.findByLabelText("Recovery code to set up passkey unlock");
  fireEvent.change(input, { target: { value: "recovery" } });
  const setup = screen.getByRole("button", { name: "Set up passkey unlock" }); fireEvent.click(setup);
  expect(await screen.findByText(/Passkey setup was cancelled/)).toBeInTheDocument(); expect(input).toHaveValue("recovery");
  fireEvent.click(setup); expect(await screen.findByText("Encryption unsupported")).toBeInTheDocument(); expect(input).toHaveValue("recovery");
  fireEvent.click(setup); expect(await screen.findByText(/Passkey saved and verified/)).toBeInTheDocument();
});
it("keeps passkey unlock enabled if its removal cannot be saved", async () => {
  actions.hasPasskeyUnlock.mockResolvedValue(true); actions.disablePasskeyUnlock.mockRejectedValueOnce(new Error("Storage unavailable"));
  render(<PasskeyUnlock name="rampage201" />);
  const remove = await screen.findByRole("button", { name: "Remove passkey unlock" });
  fireEvent.click(remove); expect(await screen.findByText("Storage unavailable")).toBeInTheDocument();
  await waitFor(() => expect(remove).toBeEnabled()); expect(screen.getByText(/unlock is on/)).toBeInTheDocument();
});
