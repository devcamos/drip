// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Trends } from "../app/Trends";
import { emptyData } from "../lib/db";
import { addMonths, ymd } from "../lib/maths";
const now = ymd(new Date());
describe("clear balance history and projections", () => {
  it("distinguishes real history, today and future estimates and saves explicit assumptions", () => {
    const update = vi.fn();
    const data = { ...emptyData(), snapshots: [{ month: addMonths(now, -8).slice(0, 7), totalBalance: 2000, monthlyIncome: 10 }, { month: addMonths(now, -1).slice(0, 7), totalBalance: 2500, monthlyIncome: 15 }] };
    render(<Trends data={data} onAssumptions={update} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Dashed lines show estimates/);
    fireEvent.click(screen.getByText("View chart figures"));
    expect(screen.getAllByText("Estimate")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "3m" }));
    expect(screen.getByRole("button", { name: "3m" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Estimate")).toBeNull();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    for (const range of ["6m", "1y", "Max", "Future"]) fireEvent.click(screen.getByRole("button", { name: range }));
    fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
    fireEvent.change(screen.getByLabelText("Planned monthly top-up (£)"), { target: { value: "-1" } });
    expect(screen.getByRole("button", { name: "Save projection" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Planned monthly top-up (£)"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Project ahead"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save projection" }));
    expect(update).toHaveBeenCalledWith({ monthlyDeposit: 200, years: 3 });
  });
  it("does not invent historical balances when tracking starts today", () => {
    render(<Trends data={{ ...emptyData(), projection: { monthlyDeposit: 200, years: 3 } }} onAssumptions={vi.fn()} />);
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getByText(/Your history starts today/)).toBeInTheDocument();
    expect(screen.getByText("Estimated balance in 3 years")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/£7,200.00/);
  });
});
