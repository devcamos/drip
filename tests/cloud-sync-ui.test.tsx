// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
const cloud = vi.hoisted(() => ({ readCloudState: vi.fn(), syncNow: vi.fn() }));
vi.mock("../lib/cloud", () => cloud);
import { CloudSync } from "../app/CloudRecovery";
let state: { userId: string; identityId: string; generation: string; revision: number; dirty: boolean; lastSyncAt: string | null };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.stubGlobal("navigator", { onLine: true });
  state = { userId: "owner", identityId: "identity", generation: "connection", revision: 0, dirty: false, lastSyncAt: null };
  cloud.readCloudState.mockImplementation(async () => ({ ...state }));
  cloud.syncNow.mockResolvedValue("Cloud copy is up to date.");
});
afterEach(() => vi.useRealTimers());
it("invalidates an old success immediately when a new local edit is saved", async () => {
  render(<CloudSync />); await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole("status")).toHaveTextContent("Cloud copy is up to date.");
  state = { ...state, dirty: true, revision: 1 };
  await act(async () => { window.dispatchEvent(new Event("drip-data-saved")); });
  expect(screen.getByRole("status")).toHaveTextContent("Checking cloud sync");
  expect(screen.getByRole("status")).not.toHaveTextContent("up to date");
});
it("does not let a stale upload completion overwrite a newer pending edit", async () => {
  let finish!: (message: string) => void;
  cloud.syncNow.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  render(<CloudSync />); await act(() => vi.advanceTimersByTimeAsync(1000));
  state = { ...state, dirty: true, revision: 1 };
  await act(async () => { window.dispatchEvent(new Event("drip-data-saved")); finish("Cloud copy is up to date."); });
  expect(screen.getByRole("status")).not.toHaveTextContent("up to date");
  cloud.syncNow.mockImplementationOnce(async () => { state = { ...state, dirty: false }; return "Encrypted cloud copy saved."; });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole("status")).toHaveTextContent("Encrypted cloud copy saved.");
});
it.each([false, true])("distinguishes an offline copy with dirty=%s without claiming a cloud save", async dirty => {
  vi.stubGlobal("navigator", { onLine: false }); state = { ...state, dirty, lastSyncAt: "2026-10-19T10:00:00Z" };
  render(<CloudSync />); await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole("status")).toHaveTextContent(dirty ? "waiting to sync" : "no changes waiting to sync");
  expect(screen.getByRole("status")).toHaveTextContent("Last confirmed cloud save");
  expect(cloud.syncNow).not.toHaveBeenCalled();
});
