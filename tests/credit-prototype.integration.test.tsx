// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import WelcomePrototype from "../app/prototype/welcome/WelcomePrototype";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole("group", { name: "Preview screen" })).getByRole("button", { name: "Your accounts" }));
  await user.click(screen.getByRole("button", { name: /Barclaycard.*owed/ }));
  await user.click(screen.getByRole("button", { name: "Edit credit card" }));
  return screen.getByRole("dialog", { name: "Edit credit card" });
}

async function field(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = within(screen.getByRole("dialog")).getByLabelText(label, { exact: true });
  await user.clear(input);
  if (value) await user.type(input, value);
}

test("credit edits update recorded debt and net position while money and income remain independent", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />);
  await openEditor(user);
  await field(user, "Amount owed (£)", "1500");
  await field(user, "APR (%)", "0");
  await field(user, "Statement minimum payment (£)", "50");
  await field(user, "Planned payment (£, optional)", "100");
  fireEvent.change(screen.getByLabelText("Payment due date", { exact: true }), { target: { value: "2026-11-25" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const overview = screen.getByRole("region", { name: "Money overview" });
  for (const value of ["£7,500.00", "£1,500.00", "£6,000.00"]) expect(overview).toHaveTextContent(value);
  const payment = screen.getByRole("region", { name: "Credit card payment plan" });
  for (const value of ["£50.00", "£100.00", "25 Nov 2026"]) expect(payment).toHaveTextContent(value);
  expect(screen.getByRole("region", { name: "Estimated income" })).toHaveTextContent("£28.33");
  expect(screen.getByRole("region", { name: "Received income" })).toHaveTextContent("£0.00");
  expect(screen.getByText("0%", { exact: true })).toBeVisible();
});

test("planned payments below the statement minimum are preserved without changing balances and reset restores the sample", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />);
  await openEditor(user);
  await field(user, "Statement minimum payment (£)", "45");
  await field(user, "Planned payment (£, optional)", "25");
  expect(screen.getByRole("list", { name: "Credit card notes" })).toHaveTextContent("below the statement minimum");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const overview = screen.getByRole("region", { name: "Money overview" });
  expect(overview).toHaveTextContent("£1,200.00"); expect(overview).toHaveTextContent("£6,300.00");
  const picker = within(screen.getByRole("group", { name: "Preview screen" }));
  await user.click(picker.getByRole("button", { name: "No accounts yet" }));
  expect(screen.getByText("Your account list is empty.", { exact: false })).toBeVisible();
  await user.click(picker.getByRole("button", { name: "Your accounts" }));
  expect(screen.getByRole("region", { name: "Credit card payment plan" })).toHaveTextContent("£25.00");
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  await user.click(picker.getByRole("button", { name: "Your accounts" }));
  const restored = screen.getByRole("region", { name: "Credit card payment plan" });
  expect(restored).toHaveTextContent("£35.00"); expect(restored).toHaveTextContent("£75.00");
});

test("invalid statement edits retain the dialog and existing data; cancelling keeps values, while zero and an unset plan remain valid", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />);
  const editor = await openEditor(user);
  await field(user, "Amount owed (£)", "-1");
  await user.click(within(editor).getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("Amount owed (£)", { exact: true })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£1,200.00");
  await user.click(screen.getByRole("button", { name: "Edit credit card" }));
  for (const label of ["Amount owed (£)", "APR (%)", "Statement minimum payment (£)"]) await field(user, label, "0");
  await field(user, "Planned payment (£, optional)", "");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,500.00");
  expect(screen.getByRole("region", { name: "Credit card payment plan" })).toHaveTextContent("Not set");
});

test("statement and planned payments above the current balance show notes without silently rewriting the figures", async () => {
  const user = userEvent.setup(); render(<WelcomePrototype />);
  await openEditor(user);
  await field(user, "Amount owed (£)", "10");
  expect(within(screen.getByRole("list", { name: "Credit card notes" })).getAllByRole("listitem")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const payment = screen.getByRole("region", { name: "Credit card payment plan" });
  expect(payment).toHaveTextContent("£35.00"); expect(payment).toHaveTextContent("£75.00");
  expect(screen.getByRole("region", { name: "Money overview" })).toHaveTextContent("£7,490.00");
  expect(within(screen.getByRole("list", { name: "Payment plan notes" })).getAllByRole("listitem")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Edit credit card" }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit credit card" }));
  await user.click(screen.getByRole("button", { name: "Close credit card editor" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
