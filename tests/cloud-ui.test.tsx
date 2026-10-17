// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const cloud = vi.hoisted(() => ({ readCloudState: vi.fn(), writeCloudState: vi.fn(), restoreCloud: vi.fn(), connect: vi.fn(), syncNow: vi.fn(), vault: vi.fn(), authClient: { signIn: { passkey: vi.fn() }, getSession: vi.fn(), passkey: { addPasskey: vi.fn() }, signOut: vi.fn() } }));
vi.mock("../lib/cloud", () => cloud);
import { CloudPanel, CloudReturn, CloudSync } from "../app/CloudRecovery";
import { emptyData } from "../lib/db";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
const code = generateRecoveryCode();
const data = { ...emptyData(), identity: { id: "random", handle: "devo", createdAt: "now" } };
beforeEach(() => {
  vi.clearAllMocks();
  cloud.readCloudState.mockResolvedValue(undefined); cloud.writeCloudState.mockResolvedValue(undefined);
  cloud.connect.mockResolvedValue({ user: { id: "user" }, key: {} }); cloud.vault.mockResolvedValue({ version: 0 });
  cloud.syncNow.mockResolvedValue("Encrypted cloud copy saved."); cloud.restoreCloud.mockResolvedValue(data);
  cloud.authClient.signIn.passkey.mockResolvedValue({ error: null }); cloud.authClient.passkey.addPasskey.mockResolvedValue({ error: null });
  cloud.authClient.getSession.mockResolvedValue({ data: { user: { id: "user" } } });
  cloud.authClient.signOut.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ available: true }) })));
  vi.stubGlobal("confirm", () => true);
});
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe("returning users", () => {
  it("authenticates by passkey then requires a recovery code before restoring", async () => {
    const restored = vi.fn(); render(<CloudReturn onRestored={restored} />);
    click("Sign in with passkey");
    expect(await screen.findByText(/Signed in. Enter your recovery code/)).toBeInTheDocument();
    expect(restored).not.toHaveBeenCalled();
    fill("Recovery code", code); click("Restore cloud accounts");
    await waitFor(() => expect(restored).toHaveBeenCalledWith(data, code));
    expect(cloud.restoreCloud).toHaveBeenCalledWith(code, "user");
  });
  it.each(["passkey", "session", "decrypt"])("shows %s failures without calling restore success", async failure => {
    const restored = vi.fn();
    if (failure === "passkey") cloud.authClient.signIn.passkey.mockResolvedValue({ error: {} });
    if (failure === "session") cloud.authClient.getSession.mockResolvedValue({ data: null });
    if (failure === "decrypt") cloud.restoreCloud.mockRejectedValue(new Error("Wrong recovery code."));
    render(<CloudReturn onRestored={restored} />);
    if (failure === "decrypt") { fill("Recovery code", code); click("Restore cloud accounts"); }
    else click("Sign in with passkey");
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(restored).not.toHaveBeenCalled();
  });
  it("requires confirmation before replacing existing data", async () => {
    vi.stubGlobal("confirm", () => false);
    render(<CloudReturn replaceExisting onRestored={vi.fn()} />);
    fill("Recovery code", code); click("Restore cloud accounts");
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore cloud accounts" })).toBeEnabled());
    expect(cloud.restoreCloud).not.toHaveBeenCalled();
  });
});

describe("cloud recovery settings", () => {
  async function panel() {
    const restored = vi.fn(); render(<CloudPanel data={data} verifier={await codeVerifier(code)} onRestored={restored} />);
    return restored;
  }
  it("enables encrypted recovery, adds a passkey and disconnects without deleting data", async () => {
    await panel(); fill("Your saved recovery code", code);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable encrypted cloud recovery" })).toBeEnabled());
    click("Enable encrypted cloud recovery");
    expect(await screen.findByText("Encrypted cloud copy saved.")).toBeInTheDocument();
    expect(cloud.writeCloudState).toHaveBeenCalledWith(expect.objectContaining({ userId: "user", dirty: true }), { generation: undefined });
    cloud.readCloudState.mockResolvedValue({ userId: "user" });
    fireEvent.click(screen.getByText("Device sign-in options")); click("Add cloud sign-in passkey");
    expect(await screen.findByText(/Cloud sign-in passkey saved/)).toBeInTheDocument();
    click("Sync now"); await screen.findByText("Encrypted cloud copy saved.");
    click("Disconnect this device");
    expect(await screen.findByText(/Cloud disconnected on this device/)).toBeInTheDocument();
    expect(cloud.writeCloudState).toHaveBeenLastCalledWith(undefined, { generation: undefined, connectionGeneration: undefined });
  });
  it.each(["error-result", "rejected-request"])("keeps the connection when disconnect fails with %s", async failure => {
    cloud.readCloudState.mockResolvedValue({ userId: "user", generation: "connected", dirty: true });
    if (failure === "error-result") cloud.authClient.signOut.mockResolvedValue({ error: { message: "offline" } });
    else cloud.authClient.signOut.mockRejectedValue(new Error("Network unavailable"));
    await panel(); await screen.findByText(/Cloud recovery is connected/);
    fireEvent.click(screen.getByText("Device sign-in options")); click("Disconnect this device");
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(cloud.writeCloudState).not.toHaveBeenCalled();
    expect(screen.getByText(/Cloud recovery is connected/)).toBeInTheDocument();
    expect(screen.queryByText(/Cloud disconnected on this device/)).toBeNull();
  });
  it.each(["wrong-code", "remote-exists", "offline"])("handles %s without overwriting a cloud copy", async failure => {
    if (failure === "remote-exists") cloud.vault.mockResolvedValue({ version: 2 });
    if (failure === "offline") cloud.connect.mockRejectedValue(new Error("Offline"));
    await panel(); fill("Your saved recovery code", failure === "wrong-code" ? generateRecoveryCode() : code);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable encrypted cloud recovery" })).toBeEnabled());
    click("Enable encrypted cloud recovery");
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(cloud.writeCloudState).not.toHaveBeenCalled();
  });
  it("displays sync/passkey failures and can restore an existing cloud copy", async () => {
    cloud.readCloudState.mockResolvedValue({ userId: "user" });
    cloud.syncNow.mockRejectedValue(new Error("Cloud conflict"));
    cloud.authClient.passkey.addPasskey.mockResolvedValue({ error: {} });
    const restored = await panel();
    await screen.findByText(/Cloud recovery is connected/);
    click("Sync now"); expect(await screen.findByText("Cloud conflict")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Device sign-in options")); click("Add cloud sign-in passkey"); expect(await screen.findByText(/Passkey was not saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Restore an existing cloud copy")); fill("Recovery code", code); click("Restore cloud accounts");
    await waitFor(() => expect(restored).toHaveBeenCalledWith(data, code));
  });
  it("keeps local recovery available when the backend status cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await panel(); expect(screen.getByText(/Cloud is unavailable here/)).toBeInTheDocument();
  });
  it("renews an expired sign-in without restoring or replacing queued local data", async () => {
    cloud.readCloudState.mockResolvedValue({ userId: "user" });
    await panel();
    await screen.findByText(/Cloud recovery is connected/);
    fireEvent.click(screen.getByText("Device sign-in options")); fill("Recovery code to renew sign-in", code); click("Sign in without replacing local data");
    expect(await screen.findByText("Encrypted cloud copy saved.")).toBeInTheDocument();
    expect(cloud.restoreCloud).not.toHaveBeenCalled(); expect(cloud.writeCloudState).not.toHaveBeenCalled();
    cloud.authClient.getSession.mockResolvedValue({ data: { user: { id: "another-user" } } });
    click("Add cloud sign-in passkey");
    expect(await screen.findByText(/Sign in to the connected cloud account/)).toBeInTheDocument();
    expect(cloud.authClient.passkey.addPasskey).not.toHaveBeenCalled();
    cloud.readCloudState.mockResolvedValue(undefined);
    await act(async () => { window.dispatchEvent(new Event("drip-cloud-changed")); });
    expect(screen.getByRole("button", { name: "Enable encrypted cloud recovery" })).toBeInTheDocument();
  });
});

describe("automatic sync", () => {
  it("schedules uploads after local changes and reconnects, and reports a conflict", async () => {
    vi.useFakeTimers(); cloud.readCloudState.mockResolvedValue({});
    const view = render(<CloudSync />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(screen.getByRole("status")).toHaveTextContent("Encrypted cloud copy saved.");
    cloud.syncNow.mockRejectedValue(new Error("Cloud conflict"));
    await act(async () => { window.dispatchEvent(new Event("drip-data-saved")); await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByRole("status")).toHaveTextContent("Cloud conflict");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByRole("status")).toHaveTextContent("waiting to sync");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(61_100); });
    cloud.readCloudState.mockResolvedValue(undefined);
    await act(async () => { window.dispatchEvent(new Event("drip-data-saved")); await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.queryByRole("status")).toBeNull();
    view.unmount(); vi.useRealTimers();
  });
});
