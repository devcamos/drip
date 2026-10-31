// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PaymentCalendar } from "../app/PaymentCalendar";
import { holding } from "./notification-fixtures";

it("labels expected dates and amounts, groups daily dates and opens the correct account", () => {
  const open = vi.fn();
  render(<PaymentCalendar today="2026-10-31" accounts={[holding({ nextPayoutDate: "2026-11-15" }), holding({ id: "cash", provider: "Zopa", holdingName: undefined, rateType: "interest", frequency: "daily", balance: 3650, ratePct: 1 })]} onOpen={open} />);
  const calendar = screen.getByRole("region", { name: "Payment calendar" });
  expect(calendar).toHaveTextContent("1 Nov 2026 – 31 Oct 2027");
  const month = within(calendar).getByTestId("payment-month-2026-11"); expect(month).toHaveAttribute("open");
  expect(month).toHaveTextContent("31 expected payments · £8.00 estimated"); expect(month).toHaveTextContent("30 daily payments, grouped");
  expect(month).toHaveTextContent("Expected dividend · £5.00"); expect(month).toHaveTextContent("Expected interest · £3.00");
  fireEvent.click(within(month).getByRole("button", { name: "Open Realty Income for 2026-11-15" })); expect(open).toHaveBeenCalledWith("holding");
  expect(calendar).toHaveTextContent("Only payments you record count as received income");
});

it("updates the calendar from edited data, shows empty months and preserves the empty/invalid states", () => {
  const account = holding({ nextPayoutDate: "2026-11-15" });
  const view = render(<PaymentCalendar today="2026-10-31" accounts={[account]} onOpen={vi.fn()} />);
  expect(within(screen.getByTestId("payment-month-2026-11")).getByText("15 Nov")).toBeVisible();
  view.rerender(<PaymentCalendar today="2026-10-31" accounts={[{ ...account, nextPayoutDate: "2026-11-20", frequency: "quarterly" }]} onOpen={vi.fn()} />);
  expect(within(screen.getByTestId("payment-month-2026-11")).getByText("20 Nov")).toBeVisible();
  expect(screen.getByTestId("payment-month-2026-12")).toHaveTextContent("No expected payments");
  expect(screen.getByTestId("payment-month-2026-12")).toHaveTextContent("No payments expected in this month");
  view.rerender(<PaymentCalendar today="2026-10-31" accounts={[]} onOpen={vi.fn()} />);
  expect(screen.getByText(/No payments expected in this period/)).toBeVisible();
  view.rerender(<PaymentCalendar today="invalid" accounts={[]} onOpen={vi.fn()} />); expect(screen.queryByRole("region")).toBeNull();
});
