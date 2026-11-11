// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { AccountDetail } from "../app/AccountDetail";
import { StockReading } from "../app/stocks/StockReading";
import { releaseSaver, releaseStock } from "./saved-experience-fixtures";

test("a dividend holding offers accessible external news links without account figures", () => {
  render(<StockReading holdingName="Realty Income" />);
  const reading = screen.getByRole("region", { name: "Stock reading" });
  expect(within(reading).getByRole("heading", { name: "Reading & news" })).toBeVisible();
  const yahoo = within(reading).getByRole("link", { name: /Yahoo Finance/ });
  expect(yahoo).toHaveAttribute("href", "https://finance.yahoo.com/quote/O/news/");
  expect(yahoo).toHaveAttribute("rel", "noopener noreferrer");
  expect(reading).toHaveTextContent("Your balance and account details stay in Drip");
});

test("custom dividend holdings offer a search, while cash accounts do not show stock reading", () => {
  const props = { onBack: () => {}, onEdit: () => {}, onDelete: () => {}, onChange: () => {} };
  const view = render(<AccountDetail a={releaseStock({ holdingName: "Example Holdings" })} {...props} />);
  expect(screen.getByRole("region", { name: "Stock reading" })).toHaveTextContent("Example Holdings");
  expect(screen.getByRole("link", { name: /Yahoo Finance/ })).toHaveAttribute("href", "https://finance.yahoo.com/lookup?s=Example+Holdings");
  view.rerender(<AccountDetail a={releaseSaver()} {...props} />);
  expect(screen.queryByRole("region", { name: "Stock reading" })).toBeNull();
});
