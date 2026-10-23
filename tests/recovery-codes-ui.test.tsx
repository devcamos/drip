// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { RecoveryCodes } from "../app/RecoveryCodes";
import { emptyData } from "../lib/db";
import { codeVerifier, generateRecoveryCode } from "../lib/crypto";
const mocks = vi.hoisted(() => ({ readCloudState: vi.fn(), connect: vi.fn(), registerRecoveryCodes: vi.fn(), createRecoveryCodes: vi.fn(), authClient: { getSession: vi.fn() } }));
const passwords = vi.hoisted(() => ({ passwordUsername: vi.fn(), passwordRecoveryRoot: vi.fn() }));
const passkeys = vi.hoisted(() => ({ hasPasskeyUnlock: vi.fn(), passkeyRecoveryRoot: vi.fn() }));
const readiness = vi.hoisted(() => ({ confirmRecoveryCodesSaved: vi.fn() }));
vi.mock("../lib/password-login", () => passwords);
vi.mock("../lib/passkey-unlock", () => passkeys);
vi.mock("../lib/recovery-readiness", () => readiness);
vi.mock("../lib/cloud", () => ({ readCloudState: mocks.readCloudState, connect: mocks.connect, authClient: mocks.authClient }));
vi.mock("../lib/recovery-codes", async importOriginal => ({ ...await importOriginal<typeof import("../lib/recovery-codes")>(), registerRecoveryCodes: mocks.registerRecoveryCodes, createRecoveryCodes: mocks.createRecoveryCodes }));
import { downloadRecoveryCodes } from "../lib/recovery-codes";
const code = generateRecoveryCode(); const codes = Array.from({ length: 6 }, () => `DRIP2-${generateRecoveryCode()}`);
const data = { ...emptyData(), identity: { id: "id", handle: "devo", createdAt: "now" } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.authClient.getSession.mockResolvedValue({ data: null }); vi.stubGlobal("confirm", () => true);
  passwords.passwordUsername.mockResolvedValue(undefined); passwords.passwordRecoveryRoot.mockResolvedValue(code);
  passkeys.hasPasskeyUnlock.mockResolvedValue(false); passkeys.passkeyRecoveryRoot.mockResolvedValue(code); readiness.confirmRecoveryCodesSaved.mockResolvedValue(undefined);
  mocks.readCloudState.mockResolvedValue({ userId: "owner", version: 1 }); mocks.connect.mockResolvedValue({ user: { id: "owner" } });
  mocks.createRecoveryCodes.mockResolvedValue({ codes, records: [] }); mocks.registerRecoveryCodes.mockResolvedValue(true);
});
async function panel(value = code) {
  render(<RecoveryCodes data={data} verifier={await codeVerifier(code)} />);
  fireEvent.change(screen.getByLabelText("Your current recovery code"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create six recovery codes" }));
}
describe("recovery codes experience", () => {
  it("keeps generated codes hidden until explicitly revealed and hides them again when the window loses focus", async () => {
    await panel(); await screen.findByRole("list");
    expect(screen.getByRole("list")).not.toHaveTextContent(codes[0]);
    fireEvent.click(screen.getByRole("button", { name: "Show recovery codes" }));
    expect(screen.getByRole("list")).toHaveTextContent(codes[0]);
    fireEvent(window, new Event("blur"));
    expect(screen.getByRole("list")).not.toHaveTextContent(codes[0]);
    expect(screen.getByRole("button", { name: "Show recovery codes" })).toHaveAttribute("aria-expanded", "false");
  });
  it("creates codes with a freshly verified passkey when the password and old codes are missing", async () => {
    passkeys.hasPasskeyUnlock.mockResolvedValue(true);
    passkeys.passkeyRecoveryRoot.mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
    render(<RecoveryCodes data={data} verifier={await codeVerifier(code)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm with saved passkey" }));
    expect(screen.queryByLabelText("Your current recovery code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create six recovery codes" }));
    await screen.findByRole("status"); expect(mocks.registerRecoveryCodes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create six recovery codes" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(6);
    expect(passkeys.passkeyRecoveryRoot).toHaveBeenCalledTimes(2);
    expect(passwords.passwordRecoveryRoot).not.toHaveBeenCalled();
  });
  it("requires a download and explicit saved-file confirmation before completing setup", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await panel(); await screen.findByRole("list");
    expect(screen.queryByRole("button", { name: "I’ve saved my recovery codes" })).toBeNull();
    expect(readiness.confirmRecoveryCodesSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));
    readiness.confirmRecoveryCodesSaved.mockRejectedValueOnce(new Error("Storage unavailable"));
    const confirm = screen.getByRole("button", { name: "I’ve saved my recovery codes" });
    fireEvent.click(confirm);
    expect(await screen.findByText(/Could not save your confirmation/)).toBeInTheDocument();
    fireEvent.click(confirm);
    expect(await screen.findByText(/Recovery setup complete/)).toBeInTheDocument();
  });
  it("creates the first code set with password confirmation and keeps wrong passwords from registering codes", async () => {
    passwords.passwordUsername.mockResolvedValue("devo");
    passwords.passwordRecoveryRoot.mockRejectedValueOnce(new Error("Gamertag or password is incorrect."));
    render(<RecoveryCodes data={data} verifier={await codeVerifier(code)} />);
    const input = await screen.findByLabelText("Confirm your password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Create six recovery codes" }));
    await screen.findByText("Gamertag or password is incorrect."); expect(mocks.registerRecoveryCodes).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Green meadow 42!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create six recovery codes" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(6); expect(input).not.toBeInTheDocument();
    expect(passwords.passwordRecoveryRoot).toHaveBeenLastCalledWith("Green meadow 42!");
  });
  it.each([true, false])("reveals all six codes after confirmed registration even when caching is %s", async cached => {
    mocks.registerRecoveryCodes.mockResolvedValue(cached);
    if (cached) mocks.authClient.getSession.mockResolvedValue({ data: { user: { id: "owner" } } });
    await panel();
    expect(await screen.findAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Download recovery codes" })).toBeEnabled();
    if (!cached) expect(screen.getByText(/could not cache/)).toBeInTheDocument();
  });
  it.each(["local-only", "wrong-code", "wrong-owner", "server-failure", "cancel"])("does not reveal unregistered codes on %s", async failure => {
    if (failure === "local-only") mocks.readCloudState.mockResolvedValue(undefined);
    if (failure === "wrong-owner") mocks.connect.mockResolvedValue({ user: { id: "other" } });
    if (failure === "server-failure") mocks.registerRecoveryCodes.mockRejectedValue(new Error("Could not save recovery codes."));
    if (failure === "cancel") vi.stubGlobal("confirm", () => false);
    await panel(failure === "wrong-code" ? generateRecoveryCode() : code);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create six recovery codes" })).toBeEnabled());
    expect(screen.queryByRole("list")).toBeNull();
    if (failure !== "cancel") expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("downloads a readable text file containing six separate numbered lines", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    let blob: Blob | undefined;
    const createObjectURL = vi.fn((value: Blob) => { blob = value; return "blob:test"; });
    const revokeObjectURL = vi.fn(); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await panel(); await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));
    expect(click).toHaveBeenCalledOnce();
    const text = await blob!.text();
    expect(text.split("\n").filter(line => /^\d\. /.test(line))).toEqual(codes.map((c, i) => `${i + 1}. ${c}`));
    expect(text).toContain("Gamertag: devo");
    expect(text).not.toContain("\\n");
    vi.useFakeTimers(); downloadRecoveryCodes(codes); await vi.advanceTimersByTimeAsync(1100); vi.useRealTimers();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});
