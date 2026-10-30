// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountForm } from "../app/AccountForm";
import { AccountDetail } from "../app/AccountDetail";
import { TRADING_212_HOLDINGS } from "../lib/products";
import { accountCardStyle, normaliseColour } from "../lib/account-colour";
import type { Account } from "../lib/types";
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const old: Account = { id: "stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", label: "Private pot", balance: 100_000, currency: "GBP", ratePct: 5, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#ffeedd", payouts: [{ id: "p1", date: "2026-10-01", amount: 400, kind: "actual" }], events: [], createdAt: "2026-10-01" };

it("offers Lloyds with category-driven interest defaults, without choosing an ISA for the provider", () => {
  const save = vi.fn(); render(<AccountForm onSave={save} onCancel={vi.fn()} />);
  change("Provider", "Lloyds Bank"); change("Balance", "2500"); change("Rate", "3.25");
  expect(screen.getByLabelText("Product category")).toHaveValue("easy-access");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ provider: "Lloyds Bank", productCategory: "easy-access", taxWrapper: "none", rateType: "interest", ratePct: 3.25, frequency: "monthly" }));
});

it("offers the six requested stocks and keeps yield and schedule user-entered when holdings change", () => {
  const save = vi.fn(); render(<AccountForm onSave={save} onCancel={vi.fn()} />);
  change("Product category", "stocks-funds"); change("Provider", "Trading212");
  const picker = screen.getByLabelText("Stock / fund");
  for (const name of TRADING_212_HOLDINGS) expect(within(picker).getByRole("option", { name })).toBeInTheDocument();
  expect(screen.getByLabelText("Rate")).toHaveValue("");
  change("Balance", "1200"); change("Rate", "5.75"); change("Paid", "monthly");
  change("Stock / fund", "Realty Income"); change("Stock / fund", "Digital Realty");
  expect(screen.getByLabelText("Rate")).toHaveValue("5.75"); expect(screen.getByLabelText("Paid")).toHaveValue("monthly");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ holdingName: "Digital Realty", provider: "Trading212", ratePct: 5.75, frequency: "monthly", rateType: "dividend", balance: 120_000 }));
});

it("supports custom holdings and whole-account entries without confusing them with private nicknames", () => {
  const save = vi.fn(); render(<AccountForm existing={old} onSave={save} onCancel={vi.fn()} />);
  change("Stock / fund", "custom"); expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  change("Stock / fund name", "Custom investment trust");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ holdingName: "Custom investment trust", label: "Private pot" }));
});

it("keeps a custom holding through broker switches and clears it only when saved as a non-stock product", () => {
  const save = vi.fn(); render(<AccountForm existing={old} onSave={save} onCancel={vi.fn()} />);
  change("Provider", "Vanguard"); change("Stock / fund name (optional)", "My custom fund"); change("Provider", "Trading212");
  expect(screen.getByLabelText("Stock / fund")).toHaveValue("custom");
  expect(screen.getByLabelText("Stock / fund name")).toHaveValue("My custom fund");
  change("Product category", "easy-access");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ holdingName: undefined, productCategory: "easy-access", rateType: "interest" }));
});

it("preserves a chosen colour through ordinary edits and provider changes, and allows a provider reset", async () => {
  const save = vi.fn().mockResolvedValue(false); render(<AccountForm existing={old} onSave={save} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Custom account colour")).toHaveValue("#ffeedd");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ colour: "#ffeedd", payouts: old.payouts, ratePct: 5, holdingName: "Realty Income" }));
  change("Custom account colour", "#767676"); change("Provider", "Lloyds Bank");
  expect(screen.getByLabelText("Custom account colour")).toHaveValue("#767676");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ colour: "#767676", holdingName: "Realty Income" }));
  fireEvent.click(screen.getByRole("button", { name: "Use provider colour" }));
  expect(screen.getByLabelText("Custom account colour")).toHaveValue("#006a4d");
});

it("keeps old whole-portfolio Trading 212 accounts editable without requiring an individual stock", () => {
  const save = vi.fn(); render(<AccountForm existing={{ ...old, holdingName: undefined }} onSave={save} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Stock / fund")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ holdingName: undefined }));
});

it("shows the holding identity on the coloured account card", () => {
  render(<AccountDetail a={old} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onChange={vi.fn()} />);
  expect(screen.getByText("Realty Income")).toBeInTheDocument(); expect(screen.getByText("Trading 212")).toBeInTheDocument();
  expect(document.querySelector(".card")).toHaveStyle({ color: "#000000" });
});

it.each([["#ffffff", "#000000"], ["#000000", "#ffffff"], ["#777777", "#000000"], ["#757575", "#ffffff"]])("keeps card text readable on %s", (colour, foreground) => {
  expect(accountCardStyle(colour).color).toBe(foreground);
});
it("normalises legacy short hex and rejects CSS values before applying card styles", () => {
  expect(normaliseColour("#AbC")).toBe("#aabbcc");
  for (const value of ["", undefined, "red", "url(https://untrusted.example)", "#123456; color:red"]) expect(normaliseColour(value)).toBe("#b85a2a");
});
