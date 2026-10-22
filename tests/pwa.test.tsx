// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { applyWorkerUpdate, PwaStatus } from "../app/PwaStatus";
afterEach(() => { delete (navigator as any).serviceWorker; vi.useRealTimers(); });

it("keeps the existing worker until the user accepts a ready update", async () => {
  const worker = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), { waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
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
  const registration = Object.assign(new EventTarget(), { waiting: null as any, installing, update: vi.fn().mockResolvedValue(undefined) });
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

it("checks a saved tab on foreground, reconnect and interval without applying the update", async () => {
  vi.useFakeTimers();
  const registration = Object.assign(new EventTarget(), { waiting: null, update: vi.fn().mockResolvedValue(undefined) });
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<PwaStatus />);
  await act(async () => {});
  expect(registration.update).toHaveBeenCalledTimes(1);
  for (const name of ["focus", "pageshow"]) await act(async () => { window.dispatchEvent(new Event(name)); });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(registration.update).toHaveBeenCalledTimes(4);
  online.mockReturnValue(false);
  await act(async () => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(300_000); });
  expect(registration.update).toHaveBeenCalledTimes(4);
  online.mockReturnValue(true);
  registration.update.mockRejectedValueOnce(new Error("offline during check"));
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await act(async () => { vi.advanceTimersByTime(300_000); });
  expect(registration.update).toHaveBeenCalledTimes(6);
  expect(screen.queryByRole("button", { name: "Reload update" })).toBeNull();
  view.unmount();
  await act(async () => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(300_000); });
  expect(registration.update).toHaveBeenCalledTimes(6);
});

it("deduplicates foreground checks while an update request is already pending", async () => {
  let finish!: () => void;
  const registration = Object.assign(new EventTarget(), { waiting: null, update: vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined) });
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  render(<PwaStatus />);
  await act(async () => {});
  await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow")); });
  expect(registration.update).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(registration.update).toHaveBeenCalledTimes(2);
});

it("explicitly reloads when another tab has already activated the offered update", () => {
  const worker = { state: "activated", postMessage: vi.fn() } as unknown as ServiceWorker;
  const listen = vi.fn(), reload = vi.fn();
  applyWorkerUpdate(worker, listen, reload);
  expect(reload).toHaveBeenCalledOnce();
  expect(listen).not.toHaveBeenCalled(); expect(worker.postMessage).not.toHaveBeenCalled();
});
