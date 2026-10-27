// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import HoldingsPrototype from "../app/prototype/HoldingsPrototype";
import { demoHoldings, gradientStyle, totals, validateHolding } from "../app/prototype/holdings";

beforeEach(() => {
  // jsdom has no native modal implementation; browser checks exercise focus/Escape.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

test("stack headers show only name and value; one selected card reveals the four stock figures", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  const card = screen.getByRole("button", { name: "Realty Income, £3,680.00" });
  expect(card).toHaveAttribute("aria-expanded", "false");
  for (const label of screen.getAllByText("Average price")) expect(label).not.toBeVisible();
  await user.click(card);
  expect(card).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByText("Average price")[0]).toBeVisible();
  for (const text of ["Shares", "Holding value", "Dividend yield", "£43.20", "5.60%", "£206.08", "£3,456.00"]) expect(screen.getAllByText(text)[0]).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Digital Realty, £4,200.00" }));
  expect(card).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "Digital Realty, £4,200.00" }));
  expect(screen.getByRole("button", { name: "Digital Realty, £4,200.00" })).toHaveAttribute("aria-expanded", "false");
});

test("filters distinguish stocks and cash and cash uses interest labels without shares", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  await user.click(screen.getByRole("button", { name: "Stocks" }));
  expect(screen.queryByRole("button", { name: "Zopa, £3,000.00" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cash" }));
  expect(screen.queryByRole("button", { name: /Realty Income,/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Zopa, £3,000.00" }));
  expect(screen.getByText("Annual rate")).toBeVisible();
  expect(screen.queryByText("Shares")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit balance & rate" }));
  expect(screen.getByRole("dialog", { name: "Edit balance & rate" })).toBeVisible();
  await user.clear(screen.getByLabelText("Current balance (£)"));
  await user.type(screen.getByLabelText("Current balance (£)"), "3500");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("button", { name: "Zopa, £3,500.00" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "All accounts" }));
  expect(screen.getByRole("button", { name: /Realty Income,/ })).toBeInTheDocument();
});

test("edits keep cost separate from market value and update the income estimate", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  await user.click(screen.getByRole("button", { name: /Realty Income,/ }));
  await user.click(screen.getByRole("button", { name: "Edit holding" }));
  const fields = [["Number of shares", "100"], ["Average purchase price (£)", "40"], ["Current holding value (£)", "5000"], ["Annual dividend yield (%)", "6"]];
  for (const [label, value] of fields) { await user.clear(screen.getByLabelText(label)); await user.type(screen.getByLabelText(label), value); }
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Realty Income, £5,000.00" })).toBeVisible();
  expect(screen.getByText("£4,000.00")).toBeVisible();
  expect(screen.getByText("£300.00")).toBeVisible();
  expect(screen.getByText("£16,520.00")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Realty Income updated in this preview.");
});

test("invalid values stay in the editor and cancel leaves the holding unchanged", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  await user.click(screen.getByRole("button", { name: /Realty Income,/ }));
  await user.click(screen.getByRole("button", { name: "Edit holding" }));
  fireEvent.change(screen.getByLabelText("Annual dividend yield (%)"), { target: { value: "-5" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Amounts cannot be negative");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Realty Income, £3,680.00" })).toBeVisible();
});

test("gradient edits preview, cancel, apply and reset without persisting demo state", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  const card = screen.getByRole("button", { name: /Realty Income,/ }).closest("article")!;
  await user.click(within(card).getByRole("button", { name: /Realty Income,/ }));
  await user.click(screen.getByRole("button", { name: /Change colour/ }));
  expect(screen.getByRole("button", { name: /Copper/ })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Forest" }));
  expect(screen.getByText("Forest gradient")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(card).toHaveAttribute("data-gradient", "Copper");
  await user.click(screen.getByRole("button", { name: /Change colour/ }));
  await user.click(screen.getByRole("button", { name: "Midnight" }));
  await user.click(screen.getByRole("button", { name: "Apply gradient" }));
  expect(card).toHaveAttribute("data-gradient", "Midnight");
  await user.click(screen.getByRole("button", { name: /Change colour/ }));
  await user.click(screen.getByText("Create your own"));
  fireEvent.change(screen.getByLabelText("First colour"), { target: { value: "#ffffff" } });
  fireEvent.change(screen.getByLabelText("Second colour"), { target: { value: "#ffff00" } });
  expect(screen.getByText("Custom gradient")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Apply gradient" }));
  expect(card).toHaveAttribute("data-gradient", "Custom");
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  expect(screen.getByRole("button", { name: /Realty Income,/ }).closest("article")).toHaveAttribute("data-gradient", "Copper");
  expect(screen.getByRole("status")).toHaveTextContent("Sample holdings reset");
});

test("close and native cancel events dismiss dialogs", async () => {
  const user = userEvent.setup();
  render(<HoldingsPrototype />);
  await user.click(screen.getByRole("button", { name: /Realty Income,/ }));
  await user.click(screen.getByRole("button", { name: "Edit holding" }));
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Change colour/ }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("calculation boundaries include fractional shares, zero values, bad input and very pale gradients", () => {
  expect(totals(demoHoldings())).toEqual({ value: 15200, income: 646.12 });
  expect(totals([])).toEqual({ value: 0, income: 0 });
  const fields = { value: "0", shares: "0.25", averagePrice: "100", yieldPct: "0" };
  expect(validateHolding(fields)).toBeNull();
  for (const [key, value] of [["value", ""], ["shares", "NaN"], ["averagePrice", "Infinity"], ["yieldPct", "100.1"], ["value", "1000000000001"]]) expect(validateHolding({ ...fields, [key]: value })).not.toBeNull();
  const background = gradientStyle({ name: "Pale", start: "#ffffff", end: "#ffffee" }).background;
  const endpoints = [...background.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)];
  expect(endpoints).toHaveLength(2);
  for (const endpoint of endpoints) {
    const luma = endpoint.slice(1).reduce((sum, channel, i) => { const value = Number(channel) / 255; return sum + [.2126, .7152, .0722][i] * (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); }, 0);
    expect(1.05 / (luma + .05)).toBeGreaterThanOrEqual(4.5);
  }
});
