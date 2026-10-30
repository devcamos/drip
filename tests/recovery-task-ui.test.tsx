// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ recoveryReadiness: vi.fn() }));
vi.mock("../lib/recovery-readiness", () => actions);
import { RecoveryTask } from "../app/RecoveryTask";
beforeEach(() => { vi.clearAllMocks(); actions.recoveryReadiness.mockResolvedValue({ passkey: false, codesSaved: false }); });
it("offers recovery setup only while no fallback has been confirmed", async () => {
  const setup = vi.fn(); render(<RecoveryTask onSetup={setup} />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up recovery" }));
  expect(setup).toHaveBeenCalledOnce();
  actions.recoveryReadiness.mockResolvedValue({ passkey: true, codesSaved: false });
  await act(async () => { window.dispatchEvent(new Event("drip-recovery-changed")); });
  expect(await screen.findByRole("status")).toHaveTextContent("Recovery is ready");
  await waitFor(() => expect(screen.queryByRole("region", { name: "Account recovery setup" })).toBeNull(), { timeout: 2000 });
});
it("keeps a known setup task visible after a storage failure and hides already completed setup", async () => {
  const { unmount } = render(<RecoveryTask onSetup={vi.fn()} />);
  await screen.findByRole("button", { name: "Set up recovery" });
  actions.recoveryReadiness.mockRejectedValue(new Error("Storage failed"));
  await act(async () => { window.dispatchEvent(new Event("drip-recovery-changed")); });
  expect(screen.getByRole("button", { name: "Set up recovery" })).toBeInTheDocument();
  unmount(); actions.recoveryReadiness.mockResolvedValue({ passkey: false, codesSaved: true });
  render(<RecoveryTask onSetup={vi.fn()} />);
  await waitFor(() => expect(actions.recoveryReadiness).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("region", { name: "Account recovery setup" })).toBeNull();
});

it("offers setup when the initial storage check fails, without claiming recovery is ready", async () => {
  actions.recoveryReadiness.mockRejectedValue(new Error("Storage unavailable"));
  render(<RecoveryTask onSetup={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "Set up recovery" })).toBeEnabled();
  expect(screen.queryByRole("status")).toBeNull();
});

function pendingReadiness() {
  let resolve!: (state: { passkey: boolean; codesSaved: boolean }) => void;
  const promise = new Promise<{ passkey: boolean; codesSaved: boolean }>(done => { resolve = done; });
  return { promise, resolve };
}

it("ignores an old readiness result after a newer event confirms saved codes", async () => {
  const first = pendingReadiness();
  actions.recoveryReadiness.mockReturnValueOnce(first.promise);
  const view = render(<RecoveryTask onSetup={vi.fn()} />);
  expect(screen.queryByRole("region", { name: "Account recovery setup" })).toBeNull();
  actions.recoveryReadiness.mockResolvedValue({ passkey: false, codesSaved: true });
  await act(async () => { window.dispatchEvent(new Event("drip-recovery-changed")); });
  await act(async () => { first.resolve({ passkey: false, codesSaved: false }); });
  expect(screen.queryByRole("region", { name: "Account recovery setup" })).toBeNull();
  view.unmount();
  window.dispatchEvent(new Event("drip-recovery-changed"));
  expect(actions.recoveryReadiness).toHaveBeenCalledTimes(2);
});

it("discards a pending readiness check when leaving Accounts", async () => {
  const first = pendingReadiness(); actions.recoveryReadiness.mockReturnValueOnce(first.promise);
  const view = render(<RecoveryTask onSetup={vi.fn()} />);
  view.unmount();
  await act(async () => { first.resolve({ passkey: false, codesSaved: false }); });
  expect(screen.queryByRole("region", { name: "Account recovery setup" })).toBeNull();
});

it("cancels the completion fade if the recovery method is removed", async () => {
  render(<RecoveryTask onSetup={vi.fn()} />);
  await screen.findByRole("button", { name: "Set up recovery" });
  vi.useFakeTimers();
  try {
    actions.recoveryReadiness.mockResolvedValue({ passkey: false, codesSaved: true });
    await act(async () => { window.dispatchEvent(new Event("drip-recovery-changed")); });
    expect(screen.getByRole("status")).toHaveTextContent("Recovery is ready");
    actions.recoveryReadiness.mockResolvedValue({ passkey: false, codesSaved: false });
    await act(async () => { window.dispatchEvent(new Event("drip-recovery-changed")); });
    expect(screen.getByRole("button", { name: "Set up recovery" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole("button", { name: "Set up recovery" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  } finally { vi.useRealTimers(); }
});
