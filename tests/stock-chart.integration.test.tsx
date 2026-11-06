// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import WelcomePrototype from "../app/prototype/welcome/WelcomePrototype";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});
afterEach(() => vi.restoreAllMocks());

async function openStock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole("group", { name: "Preview screen" })).getByRole("button", { name: "Your accounts" }));
  await user.click(screen.getByRole("button", { name: /Realty Income.*£2,500/ }));
  await user.click(screen.getByRole("button", { name: "Explore share price" }));
  return screen.getByRole("dialog", { name: "Realty Income share price" });
}

test("only explicit chart loading connects the correct listing and range; recorded GBP figures remain independent", async () => {
  const user = userEvent.setup();
  const writes = vi.spyOn(Storage.prototype, "setItem");
  render(<WelcomePrototype />);
  const dialog = await openStock(user);
  expect(dialog.querySelector("iframe")).toBeNull();
  const ranges = within(dialog).getByRole("group", { name: "Price history range" });
  await user.click(within(ranges).getByRole("button", { name: "1 year" }));
  expect(dialog.querySelector("iframe")).toBeNull();
  const holding = within(dialog).getByRole("complementary", { name: "Your recorded holding" });
  for (const value of ["£2,500.00", "50", "£48.00", "5.40%", "£135.00"]) expect(holding).toHaveTextContent(value);
  await user.click(within(dialog).getByRole("button", { name: "Load TradingView chart" }));
  const frame = within(dialog).getByTitle("Realty Income delayed share-price chart");
  const url = new URL(frame.getAttribute("src")!);
  const config = JSON.parse(decodeURIComponent(url.hash.slice(1)));
  expect(url.origin).toBe("https://www.tradingview-widget.com");
  expect(url.pathname).toBe("/embed-widget/symbol-overview/");
  expect(config).toMatchObject({ symbols: [["Realty Income", "NYSE:O|1D"]], dateRanges: ["12m|1D"] });
  expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  expect(dialog.querySelector("script")).toBeNull();
  expect(holding).toHaveTextContent("£2,500.00");
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("£28.33");
  expect(screen.getByRole("region", { name: "Received income" })).toHaveTextContent("£0.00");
  expect(writes).not.toHaveBeenCalled();
  await user.click(within(ranges).getByRole("button", { name: "3 months" }));
  const nextFrame = within(dialog).getByTitle("Realty Income delayed share-price chart");
  expect(nextFrame).not.toBe(frame);
  expect(JSON.parse(decodeURIComponent(new URL(nextFrame.getAttribute("src")!).hash.slice(1))).dateRanges).toEqual(["3m|1D"]);
  await user.click(within(dialog).getByRole("button", { name: "Hide chart" }));
  expect(dialog.querySelector("iframe")).toBeNull();
});

test("frame navigation never claims current prices; external fallback and dismiss actions remain available", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />);
  let dialog = await openStock(user);
  const fallback = within(dialog).getByRole("link", { name: "Open chart on TradingView" });
  expect(fallback).toHaveAttribute("href", "https://www.tradingview.com/symbols/NYSE-O/");
  expect(fallback).toHaveAttribute("rel", expect.stringContaining("noopener"));
  await user.click(within(dialog).getByRole("button", { name: "Load TradingView chart" }));
  fireEvent.load(within(dialog).getByTitle("Realty Income delayed share-price chart"));
  expect(within(dialog).getByRole("status")).toHaveTextContent(/frame opened/i);
  expect(within(dialog).getByText("Delayed market data", { exact: true })).toBeVisible();
  fireEvent(dialog, new Event("cancel", { bubbles: false }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Explore share price" })).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Explore share price" }));
  dialog = screen.getByRole("dialog");
  expect(dialog.querySelector("iframe")).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Back to accounts" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Explore share price" }));
  await user.click(screen.getByRole("button", { name: "Close share price view" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
