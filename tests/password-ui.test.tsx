// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ passwordUsername: vi.fn(), signInPassword: vi.fn(), setLoginPassword: vi.fn() }));
vi.mock("../lib/password-login", () => actions);
import { PasswordSignIn } from "../app/PasswordSignIn";
import { PasswordSetup } from "../app/PasswordSetup";
import { emptyData } from "../lib/db";
beforeEach(() => { vi.clearAllMocks(); actions.passwordUsername.mockResolvedValue("tester"); actions.signInPassword.mockResolvedValue(undefined); actions.setLoginPassword.mockResolvedValue("tester"); });
it("offers ordinary password-manager-compatible sign-in and keeps failed credentials for retry", async () => {
  actions.signInPassword.mockRejectedValueOnce(new Error("Gamertag or password is incorrect."));
  const done = vi.fn(); render(<PasswordSignIn onSignedIn={done} />);
  const name = screen.getByLabelText("Sign-in gamertag"); await waitFor(() => expect(name).toHaveValue("tester"));
  expect(name).toHaveAttribute("autocomplete", "username"); const input = screen.getByLabelText("Password"); expect(input).toHaveAttribute("autocomplete", "current-password");
  fireEvent.change(input, { target: { value: "Some password 123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  expect(await screen.findByText(/is incorrect/)).toBeInTheDocument(); expect(done).not.toHaveBeenCalled(); expect(input).toHaveValue("Some password 123!");
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce()); expect(input).toHaveValue("");
});
it("requires confirmation before replacing another account", async () => {
  vi.stubGlobal("confirm", () => false); render(<PasswordSignIn replaceExisting onSignedIn={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Sign-in gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Some password 123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" })); expect(actions.signInPassword).not.toHaveBeenCalled();
});
it("sets and resets passwords only after recovery-code verification, clearing secrets on success", async () => {
  render(<PasswordSetup data={emptyData()} />);
  await waitFor(() => expect(screen.getByLabelText("Sign-in gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText(/Recovery code to set/), { target: { value: "RECOVERY" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Some password 123!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Different password!" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save password" }).closest("form")!);
  expect(screen.getByText("Passwords do not match.")).toBeInTheDocument(); expect(actions.setLoginPassword).not.toHaveBeenCalled();
  actions.setLoginPassword.mockRejectedValueOnce(new Error("Gamertag unavailable"));
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Some password 123!" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save password" }).closest("form")!);
  expect(await screen.findByText("Gamertag unavailable")).toBeInTheDocument(); expect(screen.getByLabelText("New password")).toHaveValue("Some password 123!");
  fireEvent.submit(screen.getByRole("button", { name: "Save password" }).closest("form")!);
  expect(await screen.findByText(/Password saved. Sign in as tester/)).toBeInTheDocument(); expect(screen.getByLabelText("New password")).toHaveValue("");
});
