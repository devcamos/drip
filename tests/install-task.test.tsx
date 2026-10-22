// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallTask, useInstallTask } from "../app/InstallTask";

function Task() { return <InstallTask state={useInstallTask()} />; }
beforeEach(() => { localStorage.removeItem("drip-install-task-v1"); });
function ios() { vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone"); }
function offer(outcome: "accepted" | "dismissed" = "dismissed") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });
  act(() => { window.dispatchEvent(event); }); return event;
}
describe("install setup task", () => {
  it("remembers manual iOS completion, fades away, and stays absent after remount", async () => {
    ios(); const first = render(<Task />);
    expect(screen.getByText(/Add to Home Screen/)).toBeVisible();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "I've added Drip" }));
      expect(screen.getByRole("status")).toHaveTextContent("Install task complete");
      act(() => { vi.advanceTimersByTime(1400); });
      expect(screen.queryByRole("region", { name: "Install Drip task" })).toBeNull();
    } finally { vi.useRealTimers(); }
    first.unmount(); render(<Task />);
    expect(screen.queryByRole("region", { name: "Install Drip task" })).toBeNull();
  });
  it.each(["accepted", "dismissed"] as const)("does not mark a %s native prompt as completed until installation is reported", async outcome => {
    render(<Task />); const event = offer(outcome);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Install" })); });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("drip-install-task-v1")).toBeNull();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.getByRole("status")).toHaveTextContent("Install task complete");
    expect(localStorage.getItem("drip-install-task-v1")).toBe("complete");
  });
  it("remembers dismissal separately from completion", () => {
    ios(); const first = render(<Task />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss install task" }));
    expect(localStorage.getItem("drip-install-task-v1")).toBe("dismissed");
    first.unmount(); render(<Task />); offer();
    expect(screen.queryByRole("region", { name: "Install Drip task" })).toBeNull();
  });
  it("handles failed prompts without falsely completing", async () => {
    render(<Task />); const event = offer(); event.prompt.mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Install" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Installation couldn't start");
    expect(localStorage.getItem("drip-install-task-v1")).toBeNull();
  });
  it("hides automatically in a standalone window", () => {
    ios(); vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query === "(display-mode: standalone)", addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    render(<Task />); offer();
    expect(screen.queryByRole("region", { name: "Install Drip task" })).toBeNull();
  });
});
