// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "../app/error";
import Diagnostics from "../app/Diagnostics";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("offers a render retry without disclosing the exception or clearing saved data", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem("synthetic-kept", "retained");
  const reset = vi.fn();
  render(<ErrorPage error={new Error("password=secret balance=12345")} reset={reset} />);
  expect(screen.getByRole("alert").textContent).not.toMatch(/secret|12345/);
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(reset).toHaveBeenCalledOnce();
  expect(localStorage.getItem("synthetic-kept")).toBe("retained");
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/secret|12345/);
});

it("handles unknown browser rejections safely and removes its listeners on unmount", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const listeners = vi.spyOn(window, "addEventListener");
  const view = render(<Diagnostics />);
  const event = new Event("unhandledrejection"); Object.defineProperty(event, "reason", { value: "private password and balance" });
  window.dispatchEvent(event);
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/password|balance|private/);
  expect(output).toHaveBeenCalledOnce();
  const onError = listeners.mock.calls.find(([type]) => type === "error")![1] as EventListener;
  onError(new ErrorEvent("error", { error: { name: "QuotaExceededError", message: "private" } }));
  expect(JSON.parse(output.mock.calls.at(-1)![0]).kind).toBe("storage_full");
  view.unmount(); output.mockClear(); window.dispatchEvent(event);
  expect(output).not.toHaveBeenCalled();
});
