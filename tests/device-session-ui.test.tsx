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
  it("offers saved-passkey unlock, keeps recovery after cancellation and calls back only after success", async () => {
    passkeys.hasPasskeyUnlock.mockResolvedValue(true);
    passkeys.unlockWithPasskey.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
    const resumed = vi.fn();
    render(<SignedOut onSignedIn={resumed} mode="locked" />);
    const button = await screen.findByRole("button", { name: "Unlock with passkey" });
    fireEvent.click(button);
    expect(await screen.findByText(/Passkey unlock was cancelled/)).toBeInTheDocument();
    expect(resumed).not.toHaveBeenCalled(); expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    actions.resumeDevice.mockRejectedValueOnce(new Error("That isn't your recovery code."));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    expect(resumed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
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
