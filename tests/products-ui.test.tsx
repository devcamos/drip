// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AccountForm } from "../app/AccountForm";
import { AccountDetail } from "../app/AccountDetail";
import type { Account } from "../lib/types";
const today = new Date().toISOString().slice(0, 10);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const a: Account = { id: "a", provider: "MoneyFarm", label: "", productCategory: "cash-isa", taxWrapper: "cash-isa", balance: 3000, ratePct: 4, rateType: "interest", frequency: "daily", nextPayoutDate: today, payouts: [], events: [], colour: "", createdAt: today, bonus: { amount: 15.44, expectedDate: "2030-05-06" } };
function DetailHarness() {
  const [account, setAccount] = useState(a);
  return <AccountDetail a={account} onBack={() => {}} onEdit={() => {}} onDelete={() => {}} onChange={setAccount} />;
}
describe("category-driven accounts", () => {
  it("changes calculation defaults for every provider, permits overrides, and saves ISA/bonus assumptions", () => {
    const save = vi.fn(); render(<AccountForm onSave={save} onCancel={vi.fn()} />);
    change("Product category", "stocks-funds");
    expect(screen.getByLabelText("Paid")).toHaveValue("quarterly");
    expect(screen.getByLabelText("Reinvest predicted income")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Held in a Stocks & Shares ISA"));
    change("Provider", "Other"); change("Provider name", "Any Broker"); change("Balance", "1000"); change("Rate", "5");
    change("Paid", "annually"); fireEvent.click(screen.getByLabelText("Track a pending bonus"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    change("Pending bonus amount £", "15.44"); change("Expected bonus payment date", "2030-05-06");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ provider: "Any Broker", productCategory: "stocks-funds", taxWrapper: "stocks-shares-isa", rateType: "dividend", frequency: "annually", reinvestIncome: false, bonus: { amount: 15.44, expectedDate: "2030-05-06" } }));
    for (const category of ["regular-saver", "current-account", "easy-access", "cash-isa"]) {
      change("Product category", category); expect(screen.getByLabelText("Reinvest predicted income")).toBeChecked();
    }
    change("Paid", "daily"); expect(screen.queryByLabelText("Next payout date")).toBeNull();
    expect(screen.queryByText(/eligibility checks/i)).toBeNull();
  });
  it("preserves rates and history when classifying an old account or editing its balance", () => {
    const save = vi.fn(); const old = { ...a, productCategory: undefined, taxWrapper: undefined, bonus: undefined };
    render(<AccountForm existing={old} onSave={save} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Product category")).toHaveValue("other");
    expect(screen.getByLabelText("Paid")).toHaveValue("daily");
    change("Product category", "cash-isa"); change("Balance", "3200");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ balance: 3200, ratePct: 4, productCategory: "cash-isa", payouts: [], events: [{ type: "set", amount: 3200, date: today }] }));
  });
  it("records income and a bonus without changing the balance, and allows correcting a payment", () => {
    vi.stubGlobal("confirm", () => true); render(<DetailHarness />);
    expect(screen.getByText("Cash ISA")).toBeInTheDocument();
    change("Income amount", "22.65"); fireEvent.click(screen.getByRole("button", { name: "Record income" }));
    expect(screen.getByTestId("income-history")).toHaveTextContent("£22.65");
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
    fireEvent.click(screen.getByRole("button", { name: "By week" })); expect(screen.getByTestId("income-history")).toHaveTextContent("Week of");
    fireEvent.click(screen.getByRole("button", { name: "By month" }));
    change("Payment type", "bonus"); change("Income amount", "15.44"); fireEvent.click(screen.getByRole("button", { name: "Record income" }));
    expect(screen.queryByText(/Pending bonus ·/)).toBeNull();
    const summary = within(screen.getByRole("region", { name: "Recorded income summary" }));
    expect(summary.getAllByText("£38.09")).toHaveLength(2); expect(summary.getAllByText("£0.00")).toHaveLength(2);
    fireEvent.click(screen.getByText("View payments"));
    fireEvent.click(screen.getByRole("button", { name: /Remove interest payment/ }));
    expect(screen.getByTestId("income-history")).toHaveTextContent("£15.44");
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
    fireEvent.click(screen.getByRole("button", { name: "Update balance" })); change("amount", "3500");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(document.querySelector(".bal")).toHaveTextContent("£3,500.00");
    expect(screen.getByTestId("income-history")).toHaveTextContent("£15.44");
  });
});
