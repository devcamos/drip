// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ readCloudState: vi.fn(), readDeviceSession: vi.fn(), signOutDevice: vi.fn(), finishDeviceSignOut: vi.fn(), resumeDevice: vi.fn(), restoreOtherAccount: vi.fn() }));
const passkeys = vi.hoisted(() => ({ hasPasskeyUnlock: vi.fn(), unlockWithPasskey: vi.fn() }));
vi.mock("../lib/cloud", () => ({ readCloudState: actions.readCloudState }));
vi.mock("../lib/device-session", () => actions);
vi.mock("../lib/passkey-unlock", () => passkeys);
import { SignOutButton, SignedOut } from "../app/DeviceSession";
import { emptyData } from "../lib/db";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("confirm", vi.fn(() => true));
  actions.readCloudState.mockResolvedValue({ dirty: true }); actions.readDeviceSession.mockResolvedValue({ remotePending: false });
  actions.signOutDevice.mockResolvedValue(undefined); actions.finishDeviceSignOut.mockResolvedValue(undefined); actions.resumeDevice.mockResolvedValue(undefined);
  passkeys.hasPasskeyUnlock.mockResolvedValue(false); passkeys.unlockWithPasskey.mockResolvedValue(undefined);
});
describe("visible sign-out and code return", () => {
  it.each(["signedOut", "locked", "migration"] as const)("offers the available app update while %s without requiring authentication", async mode => {
    const worker = { state: "installed", postMessage: vi.fn() };
    const registration = Object.assign(new EventTarget(), { waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
    const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
    const resumed = vi.fn();
    try {
      render(<SignedOut mode={mode} onSignedIn={resumed} />);
      fireEvent.click(await screen.findByRole("button", { name: "Reload update" }));
      expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(resumed).not.toHaveBeenCalled();
    } finally { delete (navigator as any).serviceWorker; }
  });
  it("records a failed sign-out without serializing the exception or stored account", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    actions.signOutDevice.mockRejectedValueOnce(new Error("Could not lock device. private-synthetic-detail"));
    render(<SignOutButton />); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled());
    await waitFor(() => expect(output).toHaveBeenCalled());
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "auth", kind: "unexpected" });
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/private-synthetic|Could not lock|password|recovery/);
  });
  it("handles an unavailable saved-passkey lookup while keeping password sign-in available", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    passkeys.hasPasskeyUnlock.mockRejectedValueOnce(new DOMException("private-synthetic-passkey-store", "QuotaExceededError"));
    const resumed = vi.fn(); render(<SignedOut onSignedIn={resumed} />);
    await waitFor(() => expect(output).toHaveBeenCalled());
    expect(screen.getByRole("form", { name: "Password sign-in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock with passkey" })).toBeNull();
    expect(resumed).not.toHaveBeenCalled(); expect(JSON.stringify(output.mock.calls)).not.toContain("private-synthetic");
  });
  it.each(["signedOut", "locked"] as const)("uses one gamertag login in %s and shows recovery methods only after Forgot password", async mode => {
    passkeys.hasPasskeyUnlock.mockResolvedValue(true);
    render(<SignedOut mode={mode} onSignedIn={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sign in to Drip" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Password sign-in" })).toBeInTheDocument();
    await waitFor(() => expect(passkeys.hasPasskeyUnlock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Unlock with passkey" })).toBeNull();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Use another account" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByRole("button", { name: "Unlock with passkey" })).toBeInTheDocument();
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Password sign-in" })).toBeNull();
  });
  it.each(["signedOut", "locked"] as const)("offers Sign up from %s, supports the route and returns without replacing data", async mode => {
    const resumed = vi.fn(); render(<SignedOut mode={mode} onSignedIn={resumed} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(window.location.hash).toBe("#signup");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Create password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("form", { name: "Password sign-in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Create password")).toBeNull();
    expect(resumed).not.toHaveBeenCalled(); expect(actions.restoreOtherAccount).not.toHaveBeenCalled();
  });
  it("offers saved-passkey unlock, keeps recovery after cancellation and calls back only after success", async () => {
    passkeys.hasPasskeyUnlock.mockResolvedValue(true);
    passkeys.unlockWithPasskey.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
    const resumed = vi.fn();
    render(<SignedOut onSignedIn={resumed} mode="locked" />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    const button = await screen.findByRole("button", { name: "Unlock with passkey" });
    fireEvent.click(button);
    expect(await screen.findByText(/Passkey unlock was cancelled/)).toBeInTheDocument();
    expect(resumed).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Back to sign in" })).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(resumed).toHaveBeenCalledOnce());
  });
  it("does not offer passkeys before legacy encryption, and keeps generic unlock failure visible", async () => {
    passkeys.hasPasskeyUnlock.mockResolvedValue(true);
    const { unmount } = render(<SignedOut onSignedIn={vi.fn()} mode="migration" />);
    await waitFor(() => expect(passkeys.hasPasskeyUnlock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Unlock with passkey" })).toBeNull(); unmount();
    passkeys.unlockWithPasskey.mockRejectedValueOnce(new Error("Invalid key"));
    render(<SignedOut onSignedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unlock with passkey" }));
    expect(await screen.findByText(/Could not unlock with this passkey/)).toBeInTheDocument();
  });
  it("warns about unsynced changes before locking, allows cancellation and reports failures", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false)); render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("unsynced changes")));
    expect(actions.signOutDevice).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true); actions.readCloudState.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(actions.signOutDevice).toHaveBeenCalledOnce());
    actions.signOutDevice.mockRejectedValue(new Error("Could not lock device."));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Could not lock device.")).toBeInTheDocument();
  });
  it("requires a recovery code and only reopens retained accounts after successful verification", async () => {
    const resumed = vi.fn(); const data = emptyData(); const verifier = { salt: "s", hash: "h" };
    render(<SignedOut data={data} verifier={verifier} onSignedIn={resumed} />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("button", { name: "Recover account" })).toBeDisabled();
    actions.resumeDevice.mockRejectedValueOnce(new Error("That isn't your recovery code."));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Recover account" }));
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    expect(resumed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Recover account" }));
    await waitFor(() => expect(resumed).toHaveBeenCalledOnce());
    expect(actions.resumeDevice).toHaveBeenLastCalledWith("correct", verifier, data);
  });
  it("keeps failed cloud revocation visible and retries on reconnect", async () => {
    actions.readDeviceSession.mockResolvedValue({ remotePending: true });
    actions.finishDeviceSignOut.mockRejectedValueOnce(new Error("Cloud sign-out is pending."));
    render(<SignedOut data={emptyData()} verifier={{ salt: "s", hash: "h" }} onSignedIn={vi.fn()} />);
    expect(await screen.findByText("Cloud sign-out is pending.")).toBeInTheDocument();
    expect(screen.getByText(/not yet confirmed/)).toBeInTheDocument();
    actions.readDeviceSession.mockResolvedValue({ remotePending: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry cloud sign-out" }));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(screen.queryByText(/not yet confirmed/)).toBeNull());
  });
  it("reports failed session reads and keeps the retry action usable", async () => {
    actions.readDeviceSession.mockResolvedValue({ remotePending: true });
    render(<SignedOut data={emptyData()} verifier={{ salt: "s", hash: "h" }} onSignedIn={vi.fn()} />);
    const retry = await screen.findByRole("button", { name: "Retry cloud sign-out" });
    actions.readDeviceSession.mockRejectedValue(new Error("Local session storage unavailable"));
    await act(async () => { window.dispatchEvent(new Event("drip-session-changed")); });
    expect(await screen.findByText("Local session storage unavailable")).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByText("Local session storage unavailable")).toBeInTheDocument();
  });
});
