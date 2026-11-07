// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import WelcomePrototype from "../app/prototype/welcome/WelcomePrototype";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});
afterEach(() => vi.unstubAllGlobals());

async function mode(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(screen.getByRole("group", { name: "Preview screen" })).getByRole("button", { name }));
}

test("sample sign-in and recovery stay separate and never submit credentials", async () => {
  const user = userEvent.setup(), fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<WelcomePrototype />);
  expect(screen.getByText("Interactive prototype · Sample data only")).toBeVisible();
  expect(screen.getByLabelText("Gamertag")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Password", { exact: true })).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(screen.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  expect(screen.queryByLabelText("Password", { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Back to demo sign-in/ }));
  await user.click(screen.getByRole("button", { name: "Enter demo" }));
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,500.00");
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("Estimated monthly average");
  expect(screen.getByRole("region", { name: "Received income" })).toHaveTextContent("£0.00");
  expect(fetch).not.toHaveBeenCalled();
});

test("first use leads with one add action and the cash choice opens matching sample details", async () => {
  const user = userEvent.setup();
  render(<WelcomePrototype />);
  await user.click(screen.getByRole("button", { name: /Preview a new account/ }));
  const first = screen.getByRole("region", { name: "No accounts yet design" });
  expect(within(first).getByRole("heading", { name: /Your money,.*taking shape/ })).toBeVisible();
  expect(within(first).queryByText(/£0|0\.00%/)).not.toBeInTheDocument();
  await user.click(within(first).getByRole("button", { name: /Add an account/ }));
  const dialog = screen.getByRole("dialog", { name: "What would you like to track?" });
  await user.click(within(dialog).getByRole("button", { name: /Cash savings/ }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const cash = screen.getByRole("button", { name: /Zopa.*£5,000/ });
  expect(cash).toHaveAttribute("aria-expanded", "true");
  const details = within(cash.closest("article")!);
  expect(details.getByText("Annual interest rate")).toBeVisible();
  expect(details.queryByText("Shares")).not.toBeInTheDocument();
  expect(screen.getByText(/Showing the cash saver example. No account has been added/)).toBeVisible();
});

test("dividend example exposes recorded holding statistics and closes the previous card", async () => {
  const user = userEvent.setup();
  render(<WelcomePrototype />);
  await mode(user, "Your accounts");
  const cash = screen.getByRole("button", { name: /Zopa.*£5,000/ });
  await user.click(cash);
  await user.click(screen.getByRole("button", { name: "Add an example account" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Stocks & funds/ }));
  expect(screen.getByRole("dialog", { name: "Realty Income share price" }).querySelector("iframe")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Back to accounts" }));
  expect(cash).toHaveAttribute("aria-expanded", "false");
  const stock = screen.getByRole("button", { name: /Realty Income.*£2,500/ });
  expect(stock).toHaveAttribute("aria-expanded", "true");
  const details = within(stock.closest("article")!);
  for (const text of ["Recorded dividend yield", "Shares", "50", "Average price", "£48.00"]) expect(details.getByText(text)).toBeVisible();
  expect(details.getByText(/No current price applied/)).toBeVisible();
  await user.click(stock);
  expect(stock).toHaveAttribute("aria-expanded", "false");
  expect(details.getByText("Shares")).not.toBeVisible();
});

test("monthly and annual estimates remain separate from received income and dated payments", async () => {
  const user = userEvent.setup();
  render(<WelcomePrototype />);
  await mode(user, "Your accounts");
  const estimate = screen.getByRole("region", { name: "Estimated income" });
  expect(estimate).toHaveTextContent("£28.33");
  expect(estimate).not.toHaveTextContent("÷");
  await user.click(within(estimate).getByRole("button", { name: "Yearly" }));
  expect(estimate).toHaveTextContent("£340.00");
  expect(estimate).toHaveTextContent("Estimated annual income");
  expect(screen.getByRole("region", { name: "Received income" })).toHaveTextContent("No payments logged yet");
  expect(screen.getByRole("region", { name: "Next expected payment" })).toHaveTextContent("It isn’t a confirmed payment");
  await user.click(within(estimate).getByRole("button", { name: "Monthly" }));
  expect(estimate).toHaveTextContent("£28.33");
});

test("optional install details dismiss and reset without changing existing local preferences", async () => {
  const user = userEvent.setup(), key = "drip-preview-isolation-check";
  localStorage.setItem(key, "retained");
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  render(<WelcomePrototype />);
  await mode(user, "Your accounts");
  await user.click(screen.getByText("Make yourself at home"));
  expect(screen.getByText(/This preview doesn’t install the app/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(screen.getByText("Install reminder hidden in this preview.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  await mode(user, "Your accounts");
  expect(screen.getByText("Make yourself at home")).toBeVisible();
  expect(screen.getByRole("button", { name: /Realty Income.*£2,500/ })).toHaveAttribute("aria-expanded", "false");
  expect(localStorage.getItem(key)).toBe("retained");
  expect(setItem).not.toHaveBeenCalled();
  setItem.mockRestore(); localStorage.removeItem(key);
});

test("closing or cancelling the account chooser preserves the current first-use screen", async () => {
  const user = userEvent.setup();
  render(<WelcomePrototype />);
  await mode(user, "No accounts yet");
  await user.click(screen.getByRole("button", { name: /Add an account/ }));
  await user.click(screen.getByRole("button", { name: "Close account chooser" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Add an account/ }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "No accounts yet design" })).toBeVisible();
});
