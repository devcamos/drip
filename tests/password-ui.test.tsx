// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ passwordUsername: vi.fn(), signInPassword: vi.fn(), setLoginPassword: vi.fn(), passwordRecoveryRoot: vi.fn() }));
const passkeys = vi.hoisted(() => ({ hasPasskeyUnlock: vi.fn(), passkeyRecoveryRoot: vi.fn() }));
vi.mock("../lib/password-login", () => actions);
vi.mock("../lib/passkey-unlock", () => passkeys);
import { PasswordSignIn } from "../app/PasswordSignIn";
import { PasswordSetup } from "../app/PasswordSetup";
import { emptyData } from "../lib/db";
import { AccountSwitchRequired } from "../lib/account-switch";
beforeEach(() => { vi.clearAllMocks(); actions.passwordUsername.mockResolvedValue("tester"); actions.signInPassword.mockResolvedValue(undefined); actions.setLoginPassword.mockResolvedValue("tester"); actions.passwordRecoveryRoot.mockResolvedValue("password-verified-root"); passkeys.hasPasskeyUnlock.mockResolvedValue(false); passkeys.passkeyRecoveryRoot.mockResolvedValue("passkey-verified-root"); });
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
it("offers an inline account switch after verification and cancellation makes no second sign-in", async () => {
  const retained = { vaultId: "saved-vault", generation: "saved-generation", records: "sealed-records" };
  actions.signInPassword.mockRejectedValueOnce(new AccountSwitchRequired(retained, true));
  render(<PasswordSignIn onSignedIn={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Sign-in gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Some password 123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  expect(await screen.findByRole("region", { name: "Switch saved account" })).toHaveTextContent("has synced");
  fireEvent.click(screen.getByRole("button", { name: "Cancel account switch" }));
  expect(actions.signInPassword).toHaveBeenCalledOnce();
  expect(screen.queryByRole("region", { name: "Switch saved account" })).toBeNull();
  expect(screen.getByLabelText("Password")).toHaveValue("");
  actions.signInPassword.mockRejectedValueOnce(new AccountSwitchRequired(retained, true));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Some password 123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  fireEvent.click(await screen.findByRole("button", { name: "Switch account on this browser" }));
  await waitFor(() => expect(actions.signInPassword).toHaveBeenLastCalledWith("tester", "Some password 123!", true, retained));
});
it("keeps unsynced account protection separate from the two-device error", async () => {
  actions.signInPassword.mockRejectedValueOnce(new AccountSwitchRequired({ vaultId: "saved", records: "sealed" }, false));
  render(<PasswordSignIn onSignedIn={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Sign-in gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Some password 123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  expect(await screen.findByText(/aren.t synced/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Switch account on this browser" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Sign-in gamertag"), { target: { value: "original" } });
  expect(screen.queryByRole("region", { name: "Switch saved account" })).toBeNull();
  actions.signInPassword.mockRejectedValueOnce(new Error("Two devices are already signed in. Sign out on one, then try again."));
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Two devices");
});
it("sets and resets passwords only after recovery-code verification, clearing secrets on success", async () => {
  render(<PasswordSetup data={emptyData()} />);
  await waitFor(() => expect(screen.getByLabelText("Sign-in gamertag")).toHaveValue("tester"));
  fireEvent.click(screen.getByRole("button", { name: /^Recovery code$/ }));
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

it("changes a password using the current password without requiring a recovery code", async () => {
  render(<PasswordSetup data={emptyData()} />);
  fireEvent.change(await screen.findByLabelText("Current password", { selector: "input" }), { target: { value: "Old password 123!" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New password 456!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "New password 456!" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByText(/Password saved/)).toBeInTheDocument();
  expect(actions.passwordRecoveryRoot).toHaveBeenCalledWith("Old password 123!");
  expect(actions.setLoginPassword).toHaveBeenCalledWith("password-verified-root", "tester", "New password 456!", expect.any(Object));
});

it("resets with a fresh saved-passkey confirmation and leaves the password unchanged on cancellation", async () => {
  passkeys.hasPasskeyUnlock.mockResolvedValue(true);
  passkeys.passkeyRecoveryRoot.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
  render(<PasswordSetup data={emptyData()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Saved unlock passkey" }));
  expect(screen.queryByLabelText("Current password", { selector: "input" })).toBeNull();
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New password 456!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "New password 456!" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByText(/confirmation was cancelled/)).toBeInTheDocument();
  expect(actions.setLoginPassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByText(/Password saved/)).toBeInTheDocument();
  expect(actions.setLoginPassword).toHaveBeenCalledWith("passkey-verified-root", "tester", "New password 456!", expect.any(Object));
});
