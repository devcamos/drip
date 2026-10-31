// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountForm } from "../app/AccountForm";
import { PaymentCalendar } from "../app/PaymentCalendar";
import { emptyData, loadData, lockLocalVault, saveData, unlockLocalVault } from "../lib/db";
import { paymentCalendar } from "../lib/payment-calendar";
import { recordedIncome } from "../lib/maths";
import type { Account } from "../lib/types";
import { calendarAccount as account } from "./payment-calendar-fixtures";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";

// Real repository, transactions and Web Crypto. fake-indexeddb is the in-memory
// IndexedDB engine, not a mocked repository. Each case gets a fresh database
// through setup-dom.ts. Calendar has no HTTP/SQL contract to replace or invent.
const today = "2026-10-31";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(today + "T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function persist(accounts: Account[]) {
  await seedVault({ ...emptyData(), accounts });
  return loadData();
}

describe("payment calendar — integration (4 cases)", () => {
  it("renders persisted schedules with correct totals and opens the selected account", async () => {
    const data = await persist([
      account(),
      account({ id: "cash", provider: "Zopa", productCategory: "easy-access", holdingName: undefined, rateType: "interest", frequency: "daily", balance: 3650, ratePct: 1 }),
    ]);
    const before = await rawStore(), open = vi.fn();
    render(<PaymentCalendar today={today} accounts={data.accounts} onOpen={open} />);
    const calendar = screen.getByRole("region", { name: "Payment calendar" });
    expect(calendar).toHaveTextContent("1 Nov 2026 – 31 Oct 2027");
    const month = within(calendar).getByTestId("payment-month-2026-11");
    expect(month).toHaveAttribute("open");
    expect(month).toHaveTextContent("31 expected payments · £8.00 estimated");
    expect(month).toHaveTextContent("30 daily payments, grouped");
    expect(month).toHaveTextContent("Expected dividend · £5.00");
    expect(month).toHaveTextContent("Expected interest · £3.00");
    fireEvent.click(within(month).getByRole("button", { name: "Open Realty Income for 2026-11-15" }));
    expect(open).toHaveBeenCalledExactlyOnceWith("holding");
    expect(calendar).toHaveTextContent("Only payments you record count as received income");
    expect(await rawStore()).toEqual(before);
  });

  it("wires a real editor save through encrypted storage into the recalculated calendar", async () => {
    const data = await persist([account({ payouts: [{ date: "2026-10-01", amount: 12.5, kind: "actual" }] })]);
    let saved = false;
    const editor = render(<AccountForm existing={data.accounts[0]} onCancel={() => {}}
      onSave={async edited => { await saveData({ ...data, accounts: [edited] }); saved = true; return true; }} />);
    fireEvent.change(screen.getByLabelText("Paid", { exact: true }), { target: { value: "quarterly" } });
    fireEvent.change(screen.getByLabelText("Next payout date", { exact: true }), { target: { value: "2026-11-20" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await waitFor(() => expect(saved).toBe(true));
    editor.unmount();
    const restored = await loadData();
    render(<PaymentCalendar today={today} accounts={restored.accounts} onOpen={() => {}} />);
    expect(within(screen.getByTestId("payment-month-2026-11")).getByText("20 Nov")).toBeVisible();
    expect(screen.getByTestId("payment-month-2026-12")).toHaveTextContent("No expected payments");
    expect(screen.getByTestId("payment-month-2026-12")).toHaveTextContent("No payments expected in this month");
    expect(screen.getByTestId("payment-month-2027-02")).toHaveTextContent("20 Feb");
    expect(restored.accounts[0]).toMatchObject({ nextPayoutDate: "2026-11-20", frequency: "quarterly", balance: 1200 });
    expect(recordedIncome(restored.accounts, undefined, today)).toBe(12.5);
  });

  it("reconstructs the same calendar after a real vault lock/unlock without writing projected income", async () => {
    const data = await persist([account({
      investment: { shares: 20, averagePriceGBP: 50 },
      bonus: { amount: 999, expectedDate: "2026-11-20" },
      payouts: [{ date: "2026-10-01", amount: 12.5, kind: "actual" }],
    })]);
    const projection = paymentCalendar(data.accounts, today), before = await rawStore();
    expect(before.data.app).toBe("drip-local-data");
    expect(JSON.stringify(before.data)).not.toMatch(/Realty Income|averagePriceGBP|payouts/);
    lockLocalVault();
    await expect(loadData()).rejects.toThrow(/Unlock/);
    await unlockLocalVault(fixtureCode);
    const restored = await loadData();
    expect(paymentCalendar(restored.accounts, today)).toEqual(projection);
    expect(restored).toEqual(data);
    expect(recordedIncome(restored.accounts, undefined, today)).toBe(12.5);
    expect(await rawStore()).toEqual(before);
  });

  it("shows empty and invalid-view states without modifying the persisted account", async () => {
    const data = await persist([account({ balance: 0 })]);
    const before = await rawStore();
    const view = render(<PaymentCalendar today={today} accounts={data.accounts} onOpen={() => {}} />);
    expect(screen.getByText(/No payments expected in this period/)).toBeVisible();
    view.rerender(<PaymentCalendar today="invalid" accounts={data.accounts} onOpen={() => {}} />);
    expect(screen.queryByRole("region", { name: "Payment calendar" })).toBeNull();
    expect(await loadData()).toEqual(data);
    expect(await rawStore()).toEqual(before);
  });
});
