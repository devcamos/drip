// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), username: vi.fn(), login: vi.fn(), signout: vi.fn() }));
vi.mock("../lib/device-management", async original => ({ ...await original<typeof import("../lib/device-management")>(), listSignedInDevices: actions.list, signOutRemoteDevice: actions.remove }));
vi.mock("../lib/password-login", () => ({ passwordUsername: actions.username, signInPassword: actions.login }));
vi.mock("../lib/device-session", () => ({ signOutDevice: actions.signout }));
import { DeviceManager, DeviceSettings } from "../app/DeviceManagement";
import { PasswordSignIn } from "../app/PasswordSignIn";
import { DeviceLimitReached } from "../lib/device-management";
const first = { id: "session-a", name: "Safari on iPhone", current: false, signedInAt: "2026-10-29T12:00:00Z" };
const second = { id: "session-b", name: "Chrome on Windows", current: true, signedInAt: "2026-10-28T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); actions.list.mockResolvedValue([first, second]); actions.remove.mockResolvedValue({ removed: true, current: false }); actions.username.mockResolvedValue("tester"); actions.login.mockResolvedValue(undefined); actions.signout.mockResolvedValue(undefined); });
it("turns a verified device-limit failure into management and resumes login only when requested", async () => {
  actions.login.mockRejectedValueOnce(new DeviceLimitReached("Two devices are already signed in."));
  const signedIn = vi.fn(); render(<PasswordSignIn onSignedIn={signedIn} />);
  await waitFor(() => expect(screen.getByLabelText("Gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic password 42!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(await screen.findByRole("button", { name: "Manage devices" }));
  expect(await screen.findByText("Safari on iPhone")).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" }));
  expect(actions.remove).not.toHaveBeenCalled();
  expect(screen.getByRole("region", { name: "Confirm device sign-out" })).toHaveTextContent("Offline copies are not erased");
  actions.list.mockResolvedValueOnce([second]);
  fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  expect(await screen.findByText(/Device signed out/)).toBeInTheDocument();
  expect(actions.remove).toHaveBeenCalledWith("tester", "Synthetic password 42!", first.id, expect.any(AbortSignal));
  expect(actions.login).toHaveBeenCalledOnce();
  fireEvent.click(await screen.findByRole("button", { name: "Sign in on this device" }));
  await waitFor(() => expect(signedIn).toHaveBeenCalledOnce());
});
it("does not offer account/device details after incorrect credentials and invalidates the old limit state when credentials change", async () => {
  actions.login.mockRejectedValueOnce(new Error("Gamertag or password is incorrect."));
  render(<PasswordSignIn onSignedIn={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Gamertag")).toHaveValue("tester"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong password" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("incorrect"); expect(screen.queryByText("Manage devices")).toBeNull();
  actions.login.mockRejectedValueOnce(new DeviceLimitReached("Two devices")); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Manage devices" });
  fireEvent.change(screen.getByLabelText("Gamertag"), { target: { value: "other" } }); expect(screen.queryByText("Manage devices")).toBeNull(); expect(actions.list).not.toHaveBeenCalled();
});
it("requires fresh password confirmation in Settings and cancellation never revokes a device", async () => {
  render(<DeviceSettings />);
  const password = await screen.findByLabelText("Confirm password to manage devices");
  expect(screen.getByRole("button", { name: "Manage devices" })).toBeDisabled();
  fireEvent.change(password, { target: { value: "Synthetic password 42!" } }); fireEvent.click(screen.getByRole("button", { name: "Manage devices" }));
  await screen.findByText("Safari on iPhone");
  fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" })); fireEvent.click(screen.getByRole("button", { name: "Keep device" }));
  expect(actions.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close devices" })); expect(await screen.findByLabelText("Confirm password to manage devices")).toHaveValue("");
});
it("locks this browser only after its own online sessions are revoked; failures preserve the list", async () => {
  actions.remove.mockRejectedValueOnce(new Error("Try again shortly."));
  render(<DeviceManager username="tester" password="Synthetic password 42!" onClose={vi.fn()} />);
  await screen.findByText("Chrome on Windows"); fireEvent.click(screen.getByRole("button", { name: "Sign out Chrome on Windows" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again"); expect(actions.signout).not.toHaveBeenCalled();
  actions.remove.mockResolvedValueOnce({ removed: true, current: true }); fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  await waitFor(() => expect(actions.signout).toHaveBeenCalledOnce());
});
it("aborts obsolete reads when management closes and handles missing password setup", async () => {
  let finish!: (value: typeof first[]) => void; actions.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { unmount } = render(<DeviceManager username="tester" password="Synthetic password 42!" onClose={vi.fn()} />);
  await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
  const signal = actions.list.mock.calls[0][2] as AbortSignal; unmount(); expect(signal.aborted).toBe(true);
  await act(async () => finish([first]));
  actions.username.mockResolvedValueOnce(undefined); render(<DeviceSettings />); expect(await screen.findByText(/Set a sign-in password/)).toBeInTheDocument();
});
it("reports a failed list read without rendering an unverified device, and closing remains available", async () => {
  actions.list.mockRejectedValueOnce(new Error("unavailable")); const close = vi.fn();
  render(<DeviceManager username="tester" password="Synthetic password 42!" onClose={close} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load"); expect(screen.queryByText("Safari on iPhone")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close devices" })); expect(close).toHaveBeenCalledOnce();
});
it("handles an already-expired sign-in and a failed login after space has been freed", async () => {
  actions.list.mockResolvedValueOnce([first]).mockResolvedValueOnce([]);
  actions.remove.mockResolvedValueOnce({ removed: false, current: false });
  const proceed = vi.fn().mockRejectedValue(new Error("Sign-in changed. Try again."));
  render(<DeviceManager username="tester" password="Synthetic password 42!" onClose={vi.fn()} onContinue={proceed} />);
  await screen.findByText("Safari on iPhone"); fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" })); fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  expect(await screen.findByRole("status")).toHaveTextContent("already signed out"); expect(screen.getByText("No devices are currently signed in.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in on this device" })); expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in changed");
});
it("keeps a successful remote sign-out visible if refreshing the list fails afterward", async () => {
  actions.list.mockResolvedValueOnce([first]).mockRejectedValueOnce(new Error("Could not refresh devices."));
  render(<DeviceManager username="tester" password="Synthetic password 42!" onClose={vi.fn()} />);
  await screen.findByText("Safari on iPhone"); fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" })); fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not refresh");
  expect(screen.getByRole("status")).toHaveTextContent("Device signed out"); expect(screen.queryByRole("region", { name: "Confirm device sign-out" })).toBeNull();
});
