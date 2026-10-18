// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PwaStatus } from "../app/PwaStatus";
afterEach(() => { delete (navigator as any).serviceWorker; });

it("keeps the existing worker until the user accepts a ready update", async () => {
  const worker = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), { waiting: worker });
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  const view = render(<PwaStatus />);
  expect(await screen.findByText(/Drip update ready/)).toBeInTheDocument();
  expect(worker.postMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reload update" }));
  expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  view.unmount();
});

it("detects a newly installed waiting worker and shows offline state", async () => {
  const installing = Object.assign(new EventTarget(), { state: "installing" });
  const worker = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), { waiting: null as any, installing });
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  render(<PwaStatus />);
  await waitFor(() => expect(sw.register).toHaveBeenCalled());
  await act(async () => { registration.dispatchEvent(new Event("updatefound")); registration.waiting = worker; installing.state = "installed"; installing.dispatchEvent(new Event("statechange")); });
  expect(screen.getByText(/Drip update ready/)).toBeInTheDocument();
  online.mockReturnValue(false); act(() => { window.dispatchEvent(new Event("offline")); });
  expect(screen.getByText(/Offline — Drip/)).toBeInTheDocument();
  online.mockReturnValue(true); act(() => { window.dispatchEvent(new Event("online")); });
  expect(screen.queryByText(/Offline — Drip/)).toBeNull();
});

it("keeps working if worker registration fails", async () => {
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockRejectedValue(new Error("unsupported")) });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  render(<PwaStatus />);
  await waitFor(() => expect(sw.register).toHaveBeenCalled());
  expect(screen.queryByText(/Drip update ready/)).toBeNull();
});
