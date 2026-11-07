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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("the initials open settings, preferences apply to Accounts, and sign-out is an explicit demo action", async () => {
  const user = userEvent.setup(), fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(<WelcomePrototype />);
  await user.click(screen.getByRole("button", { name: "Enter demo" }));
  const avatar = screen.getByRole("button", { name: "Open profile and settings" });
  await user.click(avatar);
  const profile = screen.getByRole("dialog", { name: "Profile & settings" });
  expect(within(profile).getByText("demo_grower", { exact: true })).toBeVisible();
  expect(within(profile).getByText(/Sample profile/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Enter demo" })).not.toBeInTheDocument();
  await user.click(within(profile).getByRole("button", { name: "Yearly" }));
  await user.click(within(profile).getByRole("button", { name: "Close profile and settings" }));
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("£340.00");
  await user.click(avatar);
  fireEvent(profile, new Event("cancel", { bubbles: false }));
  expect(profile).not.toBeVisible();
  await user.click(avatar);
  await user.click(within(profile).getByRole("button", { name: "Sign out of demo" }));
  expect(screen.getByRole("button", { name: "Enter demo" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});

test("multiple holdings and credit cards retain independent charts, prices, statements, totals and settings counts", async () => {
  const user = userEvent.setup();
  const fx = { base: "USD", quote: "GBP", rate: 0.75, date: new Date().toISOString().slice(0, 10), source: "Frankfurter" };
  const fetch = vi.fn().mockResolvedValue(Response.json(fx));
  vi.stubGlobal("fetch", fetch);
  render(<WelcomePrototype />);
  await user.click(screen.getByRole("button", { name: "Enter demo" }));
  await user.click(screen.getByRole("button", { name: "Add an example account" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Stocks & funds/ }));
  const stock = screen.getByRole("dialog", { name: "Digital Realty share price" });
  expect(decodeURIComponent(stock.querySelector("iframe")!.src)).toContain("NYSE:DLR");
  expect(within(stock).getByRole("complementary", { name: "Your recorded holding" })).toHaveTextContent("£2,000.00");
  await user.type(within(stock).getByLabelText("Current price per share (USD)"), "100");
  await user.click(within(stock).getByRole("button", { name: "Update demo value" }));
  expect(await screen.findByLabelText("Holding performance")).toHaveTextContent("-£300.00 (-16.67%)");
  await user.click(within(stock).getByRole("button", { name: "Back to accounts" }));
  expect(screen.getByRole("button", { name: /Digital Realty.*£1,500/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Realty Income.*£2,500/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add an example account" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Credit card/ }));
  await user.click(screen.getByRole("button", { name: "Edit credit card" }));
  const editor = screen.getByRole("dialog", { name: "Edit credit card" });
  expect(within(editor).getByText("LLOYDS CREDIT CARD · SAMPLE")).toBeVisible();
  for (const [label, value] of [["Amount owed (£)", "1000"], ["Statement minimum payment (£)", "30"], ["Planned payment (£, optional)", "80"]]) {
    const input = within(editor).getByLabelText(label, { exact: true });
    await user.clear(input); await user.type(input, value);
  }
  await user.click(within(editor).getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("button", { name: /Barclaycard.*£1,200/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Lloyds credit card.*£1,000/ })).toBeVisible();
  expect(screen.getByRole("region", { name: "Lloyds credit card payment plan" })).toHaveTextContent("£80.00");
  expect(screen.getByRole("region", { name: "Barclaycard payment plan" })).toHaveTextContent("£75.00");
  for (const value of ["£9,000.00", "£2,200.00", "£6,800.00"]) expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent(value);
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("£33.67");
  await user.click(screen.getByRole("button", { name: "Open profile and settings" }));
  const profile = within(screen.getByRole("dialog", { name: "Profile & settings" }));
  for (const category of ["Holdings", "Credit cards"]) expect(profile.getByText(category).nextElementSibling).toHaveTextContent("2");
  await user.click(profile.getByRole("button", { name: "Give feedback" }));
  expect(screen.getByRole("dialog", { name: "Give feedback" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close feedback" }));
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  await user.click(screen.getByRole("button", { name: "Enter demo" }));
  expect(screen.queryByRole("button", { name: /Digital Realty/ })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,500.00");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/exchange-rates?base=USD");
});
