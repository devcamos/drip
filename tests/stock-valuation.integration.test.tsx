// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import WelcomePrototype from "../app/prototype/welcome/WelcomePrototype";

const fx = { base: "USD", quote: "GBP", rate: 0.75, date: new Date().toISOString().slice(0, 10), source: "Frankfurter" };
const fetcher = vi.fn();
beforeEach(() => {
  fetcher.mockReset().mockImplementation(() => Promise.resolve(Response.json(fx)));
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole("group", { name: "Preview screen" })).getByRole("button", { name: "Your accounts" }));
  await user.click(screen.getByRole("button", { name: /Realty Income.*£2,500/ }));
}
function price(value: string) { fireEvent.change(screen.getByLabelText("Current price per share (USD)"), { target: { value } }); }

test("an entered price updates the holding, money and net position while preserving cost, income and saved records", async () => {
  const user = userEvent.setup(), writes = vi.spyOn(Storage.prototype, "setItem");
  render(<WelcomePrototype />); await open(user);
  expect(fetcher).not.toHaveBeenCalled();
  price("60"); await user.click(screen.getByRole("button", { name: "Update demo value" }));
  const calculation = await screen.findByLabelText("Applied price calculation");
  expect(calculation).toHaveTextContent(`Frankfurter · Rate dated ${fx.date}`);
  expect(calculation).toHaveTextContent("-£150.00 (-6.25%)");
  const holding = screen.getByRole("complementary", { name: "Your recorded holding" });
  for (const figure of ["£2,250.00", "£2,500", "£48.00", "£135.00"]) expect(holding).toHaveTextContent(figure);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith("/api/exchange-rates?base=USD", expect.objectContaining({ credentials: "same-origin" }));
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
  price("80"); await user.click(screen.getByRole("button", { name: "Update demo value" }));
  expect(holding).toHaveTextContent("£3,000.00"); expect(fetcher).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Back to accounts" }));
  expect(screen.getByRole("button", { name: /Realty Income.*£3,000.*Estimated market value/ })).toBeVisible();
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£8,000.00");
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£6,800.00");
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("£28.33");
  expect(screen.getByRole("region", { name: "Received income" })).toHaveTextContent("£0.00");
  await user.click(screen.getByRole("button", { name: "Explore share price" }));
  await user.click(screen.getByRole("button", { name: "Use recorded value" }));
  expect(screen.getByRole("complementary", { name: "Your recorded holding" })).toHaveTextContent("£2,500.00");
  await user.click(screen.getByRole("button", { name: "Back to accounts" }));
  await user.click(screen.getByRole("button", { name: "Reset demo" })); await open(user);
  expect(screen.getByLabelText("Current price per share (USD)")).toHaveValue("");
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,500.00");
  expect(writes).not.toHaveBeenCalled();
});

test("validation, provider failures, stale FX and cancellation cannot apply a wrong or late value", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />); await open(user);
  price("-5"); await user.click(screen.getByRole("button", { name: "Update demo value" }));
  expect(screen.getByRole("alert")).toHaveTextContent("positive USD"); expect(fetcher).not.toHaveBeenCalled();
  for (const response of [new Response("offline", { status: 503 }), Response.json({ ...fx, base: "EUR" }), Response.json({ ...fx, date: "2020-01-01" })]) {
    fetcher.mockResolvedValueOnce(response); price("60"); await user.click(screen.getByRole("button", { name: "Update demo value" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last value is unchanged");
    expect(screen.queryByLabelText("Applied price calculation")).toBeNull();
  }
  let resolve!: (value: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  await user.click(screen.getByRole("button", { name: "Update demo value" }));
  const signal = fetcher.mock.lastCall![1].signal as AbortSignal;
  price("80"); expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(fx)));
  expect(screen.queryByLabelText("Applied price calculation")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Update demo value" }));
  expect(await screen.findByLabelText("Applied price calculation")).toHaveTextContent("£600.00 (25.00%)");
  await user.click(screen.getByRole("button", { name: "Back to accounts" }));
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£8,000.00");
  await user.click(screen.getByRole("button", { name: "Explore share price" }));
  // A new open after expiry must fetch again; its pending result dies with the dialog.
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 8 * 86_400_000);
  fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  price("100"); await user.click(screen.getByRole("button", { name: "Update demo value" }));
  const unmountSignal = fetcher.mock.lastCall![1].signal as AbortSignal;
  await user.click(screen.getByRole("button", { name: "Close share price view" }));
  expect(unmountSignal.aborted).toBe(true);
  await act(async () => resolve(Response.json(fx)));
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,500.00");
});
