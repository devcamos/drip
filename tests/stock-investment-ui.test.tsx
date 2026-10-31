// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountForm } from "../app/AccountForm";
import { AccountDetail } from "../app/AccountDetail";
import { StockInvestmentSummary } from "../app/StockInvestment";
import { DividendPortfolio } from "../app/DividendPortfolio";
import type { Account } from "../lib/types";
const investment = { shares: 27.25750597, averagePriceGBP: 44.99, originalPrice: { currency: "USD" as const, averagePrice: 60.41 } };
const stock: Account = { id: "stock", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", label: "", balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#6b2d83", payouts: [], createdAt: "2026-10-01" };
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

it("adds optional fractional shares and USD/GBP prices without replacing market value or dividend yield", async () => {
  const save=vi.fn();render(<AccountForm existing={stock} onSave={save} onCancel={vi.fn()} />);
  expect(screen.queryByLabelText("Number of shares")).toBeNull();
  fireEvent.click(screen.getByLabelText("Track shares and average price")); expect(screen.getByRole("button",{name:"Save"})).toBeDisabled();
  change("Number of shares","27.25750597");change("Average purchase price per share (£)","44.99");change("Original price currency","USD");expect(screen.getByRole("button",{name:"Save"})).toBeDisabled();change("Average purchase price per share (USD)","60.41");
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({investment,balance:1155.28,ratePct:5.7}));
});
it("pre-fills details, supports GBP/EUR, removes opt-out details, and leaves cash accounts without stock fields", async()=>{
  const save=vi.fn();render(<AccountForm existing={{...stock,investment}} onSave={save} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Number of shares")).toHaveValue("27.25750597");expect(screen.getByLabelText("Original price currency")).toHaveValue("USD");
  change("Original price currency","EUR");change("Average purchase price per share (EUR)","50");await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({investment:{...investment,originalPrice:{currency:"EUR",averagePrice:50}}}));
  change("Original price currency","GBP");await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({investment:{shares:investment.shares,averagePriceGBP:44.99}}));
  fireEvent.click(screen.getByLabelText("Track shares and average price"));await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({investment:undefined,balance:stock.balance}));
  change("Product category","easy-access");expect(screen.queryByText("Investment details (optional)")).toBeNull();await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({investment:undefined,rateType:"interest"}));
});
it("retains values on a failed save for retry",async()=>{
  const save=vi.fn().mockResolvedValue(false);render(<AccountForm existing={{...stock,investment}} onSave={save} onCancel={vi.fn()} />);await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Save"})));expect(screen.getByRole("alert")).toBeInTheDocument();expect(screen.getByLabelText("Number of shares")).toHaveValue("27.25750597");
});
it("shows screenshot-style investment stats and sends add/edit to the existing editor",()=>{
  const edit=vi.fn();render(<AccountDetail a={{...stock,investment}} onBack={vi.fn()} onEdit={edit} onDelete={vi.fn()} onChange={vi.fn()} />);const stats=within(screen.getByRole("region",{name:"Your investment"}));
  expect(stats.getByText("£1,155.28")).toBeInTheDocument();expect(stats.getByText(/-£71.04/)).toHaveClass("err");expect(stats.getByText(/-5.79%/)).toBeInTheDocument();expect(stats.getByText("27.25750597")).toBeInTheDocument();expect(stats.getByText("US$60.41 (£44.99)")).toBeInTheDocument();expect(stats.getByText("5.7%")).toBeInTheDocument();fireEvent.click(stats.getByRole("button",{name:"Edit details"}));expect(edit).toHaveBeenCalledOnce();
});
it("handles older holdings, zero-cost and positive return without a fabricated percentage",()=>{
  const edit=vi.fn();const {rerender}=render(<StockInvestmentSummary account={stock} onEdit={edit} />);expect(screen.getAllByText("—")).toHaveLength(3);fireEvent.click(screen.getByRole("button",{name:"Add details"}));expect(edit).toHaveBeenCalledOnce();
  rerender(<StockInvestmentSummary account={{...stock,balance:100,investment:{shares:10,averagePriceGBP:10}}} onEdit={edit} />);expect(screen.getByText(/0.00%/)).toBeInTheDocument();
  rerender(<StockInvestmentSummary account={{...stock,balance:120,investment:{shares:10,averagePriceGBP:10}}} onEdit={edit} />);expect(screen.getByText(/\+£20.00/)).toBeInTheDocument();expect(screen.getByText(/20.00%/)).toBeInTheDocument();
  rerender(<StockInvestmentSummary account={{...stock,investment:{shares:10,averagePriceGBP:0}}} onEdit={edit} />);expect(screen.queryByText(/Infinity|NaN/)).toBeNull();expect(screen.getAllByText(/£1,155.28/)).toHaveLength(2);
});
it("keeps portfolio card value, shares, average price and yield visible and opens the holding",()=>{
  const open=vi.fn();render(<DividendPortfolio accounts={[{...stock,investment}]} onAdd={vi.fn()} onOpen={open} />);const card=screen.getByRole("button",{name:"Open Realty Income"});expect(card).toHaveTextContent("27.25750597 shares · Average US$60.41 (£44.99) · 5.7% yield");expect(card).toHaveTextContent("£1,155.28");fireEvent.click(card);expect(open).toHaveBeenCalledWith("stock");
});
