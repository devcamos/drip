// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Drip from "../app/Drip";
import * as db from "../lib/db";
import { generateRecoveryCode } from "../lib/crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

const originals = vi.hoisted(() => vi.fn());
const cloud = vi.hoisted(() => ({ readCloudState: vi.fn(), authClient: { getSession: vi.fn() } }));
vi.mock("../lib/original-recovery-codes", () => ({ originalRecoveryCodes: originals }));
vi.mock("../lib/cloud", async original => ({ ...await original<typeof import("../lib/cloud")>(), ...cloud }));
vi.mock("../lib/password-login", async original => ({ ...await original<typeof import("../lib/password-login")>(), passwordUsername: async () => "demo", passwordRecoveryRoot: async () => fixtureCode }));
let vaultId: string;
const codes = Array.from({ length: 6 }, () => `DRIP2-${generateRecoveryCode()}`);
beforeEach(async () => {
  vi.clearAllMocks();
  await seedVault({ ...db.emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "now" } });
  vaultId = (await db.passwordUnlockContext()).binding!.vaultId;
  await db.setItem("signupRecoveryRequired", { vaultId });
  cloud.readCloudState.mockResolvedValue({ userId: "owner", version: 1 });
  cloud.authClient.getSession.mockResolvedValue({ data: { user: { id: "owner" } } });
  originals.mockResolvedValue({ codes, cached: true, vaultId });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:synthetic", revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

async function openFile() {
  await screen.findByRole("heading", { name: "Save your recovery codes" });
  fireEvent.change(await screen.findByLabelText("Confirm your password"), { target: { value: "synthetic password" } });
  fireEvent.click(screen.getByRole("button", { name: "Open original recovery codes" }));
  await screen.findByRole("button", { name: "Download recovery codes" });
}

it("requires download and successful confirmation before showing Accounts and clears the checkpoint atomically", async () => {
  render(<Drip />); await openFile();
  expect(screen.queryByRole("button", { name: "Use a recovery code instead" })).toBeNull();
  expect(screen.queryByText(/No accounts yet/)).toBeNull();
  expect(screen.queryByRole("button", { name: "I’ve saved my recovery codes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));
  expect(await db.getItem("signupRecoveryRequired")).toBeDefined();
  vi.spyOn(db, "saveRecoveryCodesConfirmation").mockRejectedValueOnce(new Error("Synthetic storage failure"));
  fireEvent.click(screen.getByRole("button", { name: "I’ve saved my recovery codes" }));
  await screen.findByText(/Could not save your confirmation/);
  expect(await db.getItem("signupRecoveryRequired")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "I’ve saved my recovery codes" }));
  await screen.findByText(/No accounts yet/);
  expect(await db.getItem("signupRecoveryRequired")).toBeUndefined();
  expect((await rawStore()).recoveryCodesSaved.vaultId).toBe(vaultId);
});

it("resumes the required step after remount and keeps it visible on recovery-service failure", async () => {
  const view = render(<Drip />); await openFile(); view.unmount();
  originals.mockRejectedValueOnce(new Error("Recovery service unavailable. Retry shortly."));
  render(<Drip />);
  await screen.findByRole("heading", { name: "Save your recovery codes" });
  fireEvent.change(await screen.findByLabelText("Confirm your password"), { target: { value: "synthetic password" } });
  fireEvent.click(screen.getByRole("button", { name: "Open original recovery codes" }));
  await screen.findByText(/Recovery service unavailable/);
  expect(await db.getItem("signupRecoveryRequired")).toEqual({ vaultId });
  expect(screen.queryByText(/No accounts yet/)).toBeNull();
});

it("does not impose another signup download on an unrelated restored vault", async () => {
  await seedVault();
  render(<Drip />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Pick your gamertag" })).toBeInTheDocument());
  expect(screen.queryByRole("heading", { name: "Save your recovery codes" })).toBeNull();
});
