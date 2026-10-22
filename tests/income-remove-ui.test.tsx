// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDetail } from "../app/AccountDetail";
import type { Account } from "../lib/types";

const account: Account = { id: "a", provider: "Moneybox", label: "", balance: 3000, ratePct: 4,
  rateType: "interest", frequency: "monthly", nextPayoutDate: "2026-11-20", colour: "", createdAt: "2026-10-01",
  payouts: [{ date: "2026-10-10", amount: 22.65, kind: "actual", incomeType: "interest" }], events: [] };

function Harness({ persist }: Readonly<{ persist: () => Promise<boolean> }>) {
  const [data, setData] = useState(account);
  return <AccountDetail a={data} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onChange={async update => {
    if (!await persist()) return false;
    setData(update); return true;
  }} />;
}
const openPayments = () => fireEvent.click(screen.getByText("View payments"));
const remove = () => screen.getByRole("button", { name: /Remove interest payment/ });
const failure = "Payment removal could not be saved. Keep Drip open and retry.";

describe("recorded payment removal", () => {
  it("keeps the payment and balance on failed persistence, then permits a successful retry", async () => {
    vi.stubGlobal("confirm", () => true);
    const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Harness persist={persist} />); openPayments();
    fireEvent.click(remove());
    await screen.findByText(failure);
    expect(screen.getByTestId("income-history")).toHaveTextContent("£22.65");
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
    expect(remove()).not.toBeDisabled();
    expect(screen.queryByText("Payment removed. Your balance is unchanged.")).toBeNull();
    fireEvent.click(remove());
    await screen.findByText("Payment removed. Your balance is unchanged.");
    expect(screen.queryByRole("button", { name: /Remove interest payment/ })).toBeNull();
    expect(screen.getByText("No income logged yet.")).toBeInTheDocument();
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
    expect(screen.queryByText(failure)).toBeNull();
  });
  it("shows a retry error and retains the payment when persistence rejects", async () => {
    vi.stubGlobal("confirm", () => true);
    render(<Harness persist={vi.fn().mockRejectedValue(new Error("Storage unavailable"))} />); openPayments();
    fireEvent.click(remove());
    await screen.findByText(failure);
    expect(screen.getByTestId("income-history")).toHaveTextContent("£22.65");
    expect(remove()).not.toBeDisabled();
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
  });
  it("prevents duplicate removals while awaiting persistence and leaves cancellation unchanged", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true); vi.stubGlobal("confirm", confirm);
    let finish!: (saved: boolean) => void;
    const persist = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<Harness persist={persist} />); openPayments();
    fireEvent.click(remove()); expect(persist).not.toHaveBeenCalled();
    fireEvent.click(remove());
    expect(remove()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving income…" })).toBeDisabled();
    fireEvent.click(remove()); expect(persist).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("income-history")).toHaveTextContent("£22.65");
    expect(screen.queryByText("Payment removed. Your balance is unchanged.")).toBeNull();
    await act(async () => finish(true));
    expect(screen.getByText("Payment removed. Your balance is unchanged.")).toBeInTheDocument();
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
  });
});
