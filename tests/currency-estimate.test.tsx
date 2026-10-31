// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CurrencyEstimate } from "../app/CurrencyEstimate";
import { StockInvestmentSummary } from "../app/StockInvestment";
import type { Account } from "../lib/types";

const date = new Date().toISOString().slice(0, 10);
const quote = { base: "USD", quote: "GBP", rate: 0.75, date, source: "Frankfurter" };
const fetcher = vi.fn();
beforeEach(() => { fetcher.mockReset().mockResolvedValue(Response.json(quote)); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.useRealTimers());
function open() { fireEvent.click(screen.getByText("Convert a share price to GBP")); }
function price(value: string) { fireEvent.change(screen.getByLabelText("Current price per share (USD)"), { target: { value } }); }

it("converts only after user input, labels source/date, recomputes shares locally and keeps the recorded investment unchanged", async () => {
  const account = { id: "synthetic-stock", balance: 1155.28, ratePct: 5.7, investment: { shares: 10, averagePriceGBP: 44.99, originalPrice: { currency: "USD", averagePrice: 60.41 } } } as Account;
  const before = structuredClone(account);
  const { rerender } = render(<StockInvestmentSummary account={account} onEdit={vi.fn()} />);
  open(); expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Convert to GBP" })).toBeDisabled();
  price("60"); fireEvent.click(screen.getByRole("button", { name: "Convert to GBP" }));
  expect(await screen.findByLabelText("Converted holding estimate")).toHaveTextContent("£450.00");
  expect(screen.getByLabelText("Converted holding estimate")).toHaveTextContent("Estimated value in GBP");
  expect(screen.getByText(new RegExp(`Frankfurter · Rate dated ${date}`))).toBeInTheDocument();
  expect(screen.getByText("£1,155.28")).toBeInTheDocument(); expect(account).toEqual(before);
  expect(fetcher).toHaveBeenCalledWith("/api/exchange-rates?base=USD", expect.objectContaining({ credentials: "same-origin" }));
  price("80"); expect(screen.getByLabelText("Converted holding estimate")).toHaveTextContent("£600.00");
  rerender(<StockInvestmentSummary account={{ ...account, investment: { ...account.investment!, shares: 20 } }} onEdit={vi.fn()} />);
  expect(screen.getByLabelText("Converted holding estimate")).toHaveTextContent("£1,200.00"); expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["http", "invalid", "offline"])("keeps manual tracking usable on %s failures and allows retry", async mode => {
  if (mode === "http") fetcher.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  if (mode === "invalid") fetcher.mockResolvedValueOnce(Response.json({ ...quote, base: "EUR" }));
  if (mode === "offline") fetcher.mockRejectedValueOnce(new TypeError("offline"));
  render(<CurrencyEstimate currency="USD" shares={2} />); open(); price("60");
  fireEvent.click(screen.getByRole("button", { name: "Convert to GBP" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your saved balance is unchanged");
  expect(screen.queryByLabelText("Converted holding estimate")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Convert to GBP" }));
  expect(await screen.findByLabelText("Converted holding estimate")).toHaveTextContent("£90.00");
});

it("retains the dated last loaded result after a failed refresh and refuses it once too old", async () => {
  render(<CurrencyEstimate currency="USD" shares={2} />); open(); price("60");
  fireEvent.click(screen.getByRole("button", { name: "Convert to GBP" }));
  await screen.findByLabelText("Converted holding estimate");
  fetcher.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversion" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing the previously loaded, dated rate");
  expect(screen.getByLabelText("Converted holding estimate")).toHaveTextContent("£90.00");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(date + "T12:00:00Z").getTime() + 8 * 86_400_000);
  price("61"); expect(screen.queryByLabelText("Converted holding estimate")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("exchange rate is too old");
});

it("cancels pending work when the selected holding/currency unmounts", async () => {
  let done!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { done = resolve; }));
  const { unmount } = render(<CurrencyEstimate currency="USD" shares={2} />); open(); price("60");
  fireEvent.click(screen.getByRole("button", { name: "Convert to GBP" }));
  expect(screen.getByRole("button", { name: "Getting daily rate…" })).toBeDisabled();
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  unmount(); expect(signal.aborted).toBe(true);
  await act(async () => done(Response.json(quote)));
});
