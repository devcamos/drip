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
