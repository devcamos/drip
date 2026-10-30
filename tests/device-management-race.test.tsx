// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const actions = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/device-management", () => ({ listSignedInDevices: actions.list, signOutRemoteDevice: actions.remove }));
vi.mock("@/lib/password-login", () => ({ passwordUsername: vi.fn() }));
vi.mock("@/lib/cloud", () => ({ authClient: { signOut: vi.fn().mockResolvedValue({ error: null }) } }));
import { DeviceManager } from "@/app/DeviceManagement";
import { getItem, setItem } from "@/lib/db";

it("a delayed current-device revoke response must preserve a newer local generation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ available: false })));
  actions.list.mockResolvedValue([{ id: "old-owner-session", name: "Safari on iPhone", current: true, signedInAt: "2026-10-29T12:00:00Z" }]);
  let finish!: (value: { removed: boolean; current: boolean }) => void;
  actions.remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await setItem("deviceSession", { signedOut: false, remotePending: false, generation: "review-original" });
  render(<DeviceManager username="synthetic_old" password="Synthetic password 42!" onClose={vi.fn()} />);
  await screen.findByText("Safari on iPhone");
  fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
  await waitFor(() => expect(actions.remove).toHaveBeenCalledOnce());
  // Another tab completes a new sign-in before this response continuation runs.
  await setItem("deviceSession", { signedOut: false, remotePending: false, generation: "review-newer" });
  await act(async () => finish({ removed: true, current: true }));
  expect(await getItem("deviceSession")).toMatchObject({ signedOut: false, generation: "review-newer" });
});
