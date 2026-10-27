// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Drip from "../app/Drip";
import * as db from "../lib/db";
import { deriveCloudEncryptionKey, generateRecoveryCode } from "../lib/crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

const originals = vi.hoisted(() => vi.fn());
const cloud = vi.hoisted(() => ({ readCloudState: vi.fn(), connect: vi.fn(), authClient: { getSession: vi.fn() } }));
vi.mock("../lib/original-recovery-codes", () => ({ originalRecoveryCodes: originals }));
vi.mock("../lib/cloud", async original => ({ ...await original<typeof import("../lib/cloud")>(), ...cloud }));
vi.mock("../lib/password-login", async original => ({ ...await original<typeof import("../lib/password-login")>(), passwordUsername: async () => "demo", passwordRecoveryRoot: async () => fixtureCode }));
let vaultId: string;
const codes = Array.from({ length: 6 }, () => `DRIP2-${generateRecoveryCode()}`);
beforeEach(async () => {
  vi.clearAllMocks();
  const identity = { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "now" };
  await seedVault({ ...db.emptyData(), identity }, fixtureCode, { userId: "owner", identityId: identity.id, key: await deriveCloudEncryptionKey(fixtureCode), version: 1, dirty: false, lastSyncAt: "now", generation: "cloud", revision: 0 });
  vaultId = (await db.passwordUnlockContext()).binding!.vaultId;
  await db.setItem("signupRecoveryRequired", { vaultId });
  await db.unlockLocalVault(fixtureCode);
  cloud.readCloudState.mockResolvedValue({ userId: "owner", version: 1 });
  cloud.authClient.getSession.mockResolvedValue({ data: { user: { id: "owner" } } });
  cloud.connect.mockReset().mockResolvedValue({ user: { id: "owner" } });
  originals.mockReset().mockResolvedValue({ codes, cached: true, vaultId });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:synthetic", revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

async function openFile() {
  await screen.findByRole("heading", { name: "Save your recovery codes" });
  await screen.findByRole("button", { name: "Download recovery codes" });
  expect(screen.queryByLabelText("Confirm your password")).toBeNull();
}

it("accepts a saved screenshot without another password or download and clears the checkpoint only after successful confirmation", async () => {
  render(<Drip />); await openFile();
  expect(screen.queryByRole("button", { name: "Use a recovery code instead" })).toBeNull();
  expect(screen.queryByText(/No accounts yet/)).toBeNull();
  const next = screen.getByRole("button", { name: "Continue to Accounts" });
  expect(next).toBeDisabled();
  expect(screen.getAllByRole("listitem")).toHaveLength(6);
  fireEvent.click(screen.getByRole("checkbox", { name: /I’ve saved a screenshot/ }));
  expect(await db.getItem("signupRecoveryRequired")).toBeDefined();
  vi.spyOn(db, "saveRecoveryCodesConfirmation").mockRejectedValueOnce(new Error("Synthetic storage failure"));
  fireEvent.click(next);
  await screen.findByText(/Could not save your confirmation/);
  expect(await db.getItem("signupRecoveryRequired")).toBeDefined();
  fireEvent.click(next);
  await screen.findByText(/No accounts yet/);
  expect(await db.getItem("signupRecoveryRequired")).toBeUndefined();
  expect((await rawStore()).recoveryCodesSaved.vaultId).toBe(vaultId);
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  await expect(db.signupRecoveryContext()).rejects.toThrow(/Sign in again/);
});

it("offers a download and requires the same explicit saved-copy acknowledgement", async () => {
  render(<Drip />); await openFile();
  fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Continue to Accounts" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I’ve saved a screenshot/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Accounts" }));
  await screen.findByText(/No accounts yet/);
  expect(originals).toHaveBeenCalledOnce();
});

it("hides codes on blur and lets a failed download fall back to a saved screenshot", async () => {
  render(<Drip />); await openFile();
  expect(screen.getByRole("list")).toHaveAttribute("data-revealed", "true");
  fireEvent.blur(window);
  expect(screen.getByRole("list")).toHaveAttribute("data-revealed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Show recovery codes" }));
  expect(screen.getByRole("list")).toHaveAttribute("data-revealed", "true");
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => { throw new Error("Synthetic download failure"); });
  fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));
  await screen.findByText(/Could not download the file/);
  fireEvent.click(screen.getByRole("checkbox", { name: /I’ve saved a screenshot/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Accounts" }));
  await screen.findByText(/No accounts yet/);
});

it("does not show codes or accept confirmation for another vault", async () => {
  originals.mockResolvedValueOnce({ codes, cached: true, vaultId: "another-vault" });
  render(<Drip />);
  await screen.findByText(/Could not open your recovery codes/);
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue to Accounts" })).toBeNull();
  expect(await db.getItem("signupRecoveryRequired")).toEqual({ vaultId });
});

it("renews an expired cloud session after offline unlock before retrying the original codes", async () => {
  await db.setItem("deviceSession", { signedOut: false, generation: "offline-resume" });
  await db.unlockLocalVault(fixtureCode);
  let authenticated = false;
  cloud.authClient.getSession.mockResolvedValue({ data: null });
  cloud.connect.mockImplementation(async () => { authenticated = true; return { user: { id: "owner" } }; });
  originals.mockImplementation(async () => {
    if (!authenticated) throw new Error("Unauthenticated recovery request");
    return { codes, cached: true, vaultId };
  });
  render(<Drip />); await openFile();
  expect(cloud.connect).toHaveBeenCalledWith(fixtureCode, expect.objectContaining({ identity: expect.objectContaining({ handle: "demo" }) }), false, undefined, "offline-resume");
  fireEvent.click(screen.getByRole("checkbox", { name: /I’ve saved a screenshot/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Accounts" }));
  await screen.findByText(/No accounts yet/);
});

it("rejects a renewal for another owner before opening the recovery codes", async () => {
  cloud.authClient.getSession.mockResolvedValue({ data: null });
  cloud.connect.mockResolvedValue({ user: { id: "another-owner" } });
  render(<Drip />);
  await screen.findByText(/Could not open your recovery codes/);
  expect(originals).not.toHaveBeenCalled();
  expect(screen.queryByRole("list")).toBeNull();
});

it("resumes the required step after remount and keeps it visible on recovery-service failure", async () => {
  const view = render(<Drip />); await openFile(); view.unmount();
  originals.mockRejectedValueOnce(new Error("Recovery service unavailable. Retry shortly."));
  render(<Drip />);
  await screen.findByRole("heading", { name: "Save your recovery codes" });
  await screen.findByText(/Could not open your recovery codes/);
  expect(await db.getItem("signupRecoveryRequired")).toEqual({ vaultId });
  expect(screen.queryByText(/No accounts yet/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await openFile();
  expect(screen.getAllByRole("listitem")).toHaveLength(6);
});

it("does not impose another signup download on an unrelated restored vault", async () => {
  await seedVault();
  render(<Drip />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Pick your gamertag" })).toBeInTheDocument());
  expect(screen.queryByRole("heading", { name: "Save your recovery codes" })).toBeNull();
});
