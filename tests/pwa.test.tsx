// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { applyWorkerUpdate, PwaStatus, PwaUpdateSettings } from "../app/PwaStatus";
afterEach(() => { delete (navigator as any).serviceWorker; vi.useRealTimers(); });

it("keeps the existing worker until the user accepts a ready update", async () => {
  const reload = vi.fn(); vi.stubGlobal("location", { reload });
  const worker = { state: "installed", postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), { waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
  const sw = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration), controller: {} });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  const view = render(<PwaStatus allowReload={false} />);
  expect(await screen.findByText(/Drip update ready/)).toBeInTheDocument();
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Reload update" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload update" }));
  expect(worker.postMessage).not.toHaveBeenCalled();
  view.rerender(<PwaStatus allowReload />);
  fireEvent.click(screen.getByRole("button", { name: "Reload update" }));
  expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  // Activation can arrive after the user has opened an editor. Recheck the
  // latest permission instead of honouring the earlier Home-screen click.
  view.rerender(<PwaStatus allowReload={false} />);
  worker.state = "activated";
  await act(async () => { sw.dispatchEvent(new Event("controllerchange")); });
  expect(reload).not.toHaveBeenCalled();
  view.rerender(<PwaStatus allowReload />);
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reload update" }));
  expect(reload).toHaveBeenCalledOnce();
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

it("checks for updates from settings without reloading or claiming an update is installed", async () => {
  const update = vi.fn().mockResolvedValue(undefined);
  const getRegistration = vi.fn().mockResolvedValue({ update });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration } });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  render(<PwaUpdateSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Update check requested");
  expect(getRegistration).toHaveBeenCalledWith("/"); expect(update).toHaveBeenCalledOnce();
});

it("explains when a manual update check is offline or fails", async () => {
  const update = vi.fn().mockRejectedValue(new Error("failed"));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ update }) } });
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<PwaUpdateSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  expect(screen.getByRole("status")).toHaveTextContent("Connect to the internet");
  expect(update).not.toHaveBeenCalled(); online.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not check for updates"));
});

it("does not leave a manual update check stuck when the browser never responds", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ update: () => new Promise(() => {}) }) } });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  render(<PwaUpdateSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.getByRole("status")).toHaveTextContent("Could not check for updates");
  expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
});
