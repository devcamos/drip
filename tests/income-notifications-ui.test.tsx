// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DividendPortfolio } from "../app/DividendPortfolio";
import { PaymentNotifications } from "../app/PaymentNotifications";
import { PhoneReminders, PhoneReminderSync } from "../app/PhoneReminders";
import * as Phone from "../lib/phone-reminders";
import { AccountForm } from "../app/AccountForm";
import { holding } from "./notification-fixtures";
vi.mock("../lib/phone-reminders", async original => ({ ...await original<typeof Phone>(), phoneCapability: vi.fn(() => "unsupported"), phoneConfiguration: vi.fn(), phoneReminderStatus: vi.fn(), enablePhoneReminders: vi.fn(), disablePhoneReminders: vi.fn(), testPhoneReminder: vi.fn(), syncPhoneReminders: vi.fn() }));
it("shows received dividends, periods, holdings, empty history and empty portfolio", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  const open = vi.fn(), add = vi.fn(), a = holding({ payouts: [{ kind: "actual", date: "2026-09-01", amount: 500 }, { kind: "actual", date: "2026-10-01", amount: 600 }] });
  const view = render(<DividendPortfolio accounts={[a, holding({ rateType: "interest", holdingName: "Cash only" })]} onOpen={open} onAdd={add} />);
  expect(screen.getByTestId("dividend-income-total")).toHaveTextContent("£11.00");
  fireEvent.click(screen.getByRole("button", { name: "This month" })); expect(screen.getByTestId("dividend-income-total")).toHaveTextContent("£6.00");
  fireEvent.click(screen.getByRole("button", { name: "This year" })); expect(screen.getByTestId("dividend-income-total")).toHaveTextContent("£11.00");
  fireEvent.click(screen.getByRole("button", { name: "Open Realty Income" })); expect(open).toHaveBeenCalledWith("holding");
  fireEvent.click(screen.getByRole("button", { name: "Add holding" })); expect(add).toHaveBeenCalledOnce(); expect(screen.queryByText("Cash only")).toBeNull();
  view.rerender(<DividendPortfolio accounts={[holding()]} onOpen={open} onAdd={add} />); expect(screen.getByText(/Log a dividend/)).toBeVisible();
  view.rerender(<DividendPortfolio accounts={[]} onOpen={open} onAdd={add} />); fireEvent.click(screen.getByRole("button", { name: "Add dividend holding" })); expect(add).toHaveBeenCalledTimes(2); vi.useRealTimers();
});
it("lists daily cash and dividend reminders without changing balances", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  const accounts = [holding({ nextPayoutDate: "2026-10-29", payouts: [{ kind: "actual", date: "2026-10-29", amount: 500 }] }), holding({ id: "cash", rateType: "interest", holdingName: undefined, provider: "Zopa", frequency: "daily" }), holding({ id: "future", nextPayoutDate: "2026-11-01" })], open = vi.fn(), before = JSON.stringify(accounts);
  const view = render(<PaymentNotifications accounts={accounts} onOpen={open} />);
  expect(screen.getByText("1 to check")).toBeVisible(); expect(screen.getByText("Payment logged today")).toBeVisible(); fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]); expect(open).toHaveBeenCalled(); expect(JSON.stringify(accounts)).toBe(before);
  view.rerender(<PaymentNotifications accounts={[]} onOpen={open} />); expect(screen.getByText("No payments expected today.")).toBeVisible(); act(() => { vi.setSystemTime(new Date("2026-10-30T12:00:00Z")); window.dispatchEvent(new Event("focus")); }); vi.useRealTimers();
});
it("prefills a dividend holding with Trading 212 and no assumed yield", () => {
  render(<AccountForm initialCategory="stocks-funds" onSave={vi.fn()} onCancel={vi.fn()} />); expect(screen.getByLabelText("Product category")).toHaveValue("stocks-funds"); expect(screen.getByLabelText("Provider")).toHaveValue("Trading212"); expect(screen.getByLabelText("Rate")).toHaveValue("");
});
it("explains unsupported, install, signed-out and unconfigured phone states", async () => {
  vi.mocked(Phone.phoneCapability).mockReturnValue("unsupported"); const view = render(<PhoneReminders accounts={[]} />); expect(screen.getByText(/not supported/)).toBeVisible();
  vi.mocked(Phone.phoneCapability).mockReturnValue("install"); view.rerender(<PhoneReminders accounts={[]} identityId="a" />); expect(screen.getByText(/Add to Home Screen/)).toBeVisible();
  vi.mocked(Phone.phoneCapability).mockReturnValue("supported"); view.rerender(<PhoneReminders accounts={[]} />); expect(screen.getByText(/Sign in and connect/)).toBeVisible();
  vi.mocked(Phone.phoneConfiguration).mockResolvedValue({ available: false }); view.rerender(<PhoneReminders accounts={[]} identityId="b" />); expect(await screen.findByText(/not available on this deployment/)).toBeVisible();
});
it("enables from a permission gesture, tests, expires safely and turns off", async () => {
  vi.mocked(Phone.phoneCapability).mockReturnValue("supported"); vi.mocked(Phone.phoneConfiguration).mockResolvedValue({ available: true, publicKey: "public" }); vi.mocked(Phone.phoneReminderStatus).mockResolvedValue(false);
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") }); render(<PhoneReminders accounts={[]} identityId="owner" />);
  const enable = await screen.findByRole("button", { name: "Turn on phone reminders" }); await vi.waitFor(() => expect(enable).toBeEnabled()); vi.mocked(Phone.phoneReminderStatus).mockResolvedValue(true); fireEvent.click(enable);
  fireEvent.click(await screen.findByRole("button", { name: "Send test notification" })); expect(await screen.findByText(/Test accepted/)).toBeVisible();
  vi.mocked(Phone.testPhoneReminder).mockRejectedValueOnce(new Phone.PhoneReminderError("Expired", "PUSH_SUBSCRIPTION_EXPIRED")); fireEvent.click(screen.getByRole("button", { name: "Send test notification" })); expect(await screen.findByText("Expired")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Turn on phone reminders" })); await screen.findByRole("button", { name: "Turn off" }); vi.mocked(Phone.phoneReminderStatus).mockResolvedValue(false); fireEvent.click(screen.getByRole("button", { name: "Turn off" })); expect(await screen.findByText(/turned off for this device/)).toBeVisible();
});
it("retries settings failures and reports synchronous permission failures", async () => {
  vi.mocked(Phone.phoneCapability).mockReturnValue("supported"); vi.mocked(Phone.phoneConfiguration).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ available: true, publicKey: "public" }); vi.mocked(Phone.phoneReminderStatus).mockResolvedValue(false);
  vi.stubGlobal("Notification", { permission: "denied", requestPermission() { throw new Error("blocked"); } }); render(<PhoneReminders accounts={[]} identityId="owner" />); expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load/); fireEvent.click(screen.getByRole("button", { name: "Retry settings" })); const enable = screen.getByRole("button", { name: "Turn on phone reminders" }); await vi.waitFor(() => expect(enable).toBeEnabled()); fireEvent.click(enable); expect(await screen.findByText(/Could not ask/)).toBeVisible();
});
it("reports failed sync and refreshes on reconnect", async () => {
  const manage = vi.fn(); vi.mocked(Phone.syncPhoneReminders).mockRejectedValue(new Error("offline")); render(<PhoneReminderSync accounts={[]} identityId="owner" onManage={manage} />); fireEvent(window, new Event("online")); expect(await screen.findByText(/could not be updated/)).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "Manage" })); expect(manage).toHaveBeenCalledOnce(); vi.mocked(Phone.syncPhoneReminders).mockResolvedValue(undefined); fireEvent(window, new Event("online")); await vi.waitFor(() => expect(screen.queryByText(/could not be updated/)).toBeNull());
});
