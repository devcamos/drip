// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Trends } from "../app/Trends";
import { emptyData } from "../lib/db";

function enterProjection() {
  fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
  fireEvent.change(screen.getByLabelText("Planned monthly top-up (£)"), { target: { value: "200" } });
  fireEvent.change(screen.getByLabelText("Project ahead"), { target: { value: "3" } });
}

describe("projection save completion", () => {
  it("keeps the confirmed forecast and editor until the save succeeds, without duplicate submissions", async () => {
    let finish!: (saved: boolean) => void;
    const update = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<Trends data={emptyData()} onAssumptions={update} />);
    enterProjection();
    fireEvent.click(screen.getByRole("button", { name: "Save projection" }));
    expect(screen.getByRole("button", { name: "Saving projection…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit projection" })).toBeDisabled();
    expect(screen.getByLabelText("Planned monthly top-up (£)")).toBeDisabled();
    expect(screen.getByLabelText("Project ahead")).toBeDisabled();
    expect(screen.getByText("Estimated balance in 1 year")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/Estimated £0.00/);
    fireEvent.submit(screen.getByRole("form", { name: "Projection assumptions" }));
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
    expect(screen.queryByLabelText("Planned monthly top-up (£)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit projection" })).toHaveAttribute("aria-expanded", "false");
  });

  it.each(["false", "rejection"])("retains entered assumptions after a %s save and allows one successful retry", async failure => {
    const update = vi.fn<() => Promise<boolean>>();
    if (failure === "false") update.mockResolvedValueOnce(false);
    else update.mockRejectedValueOnce(new Error("device write failed"));
    update.mockResolvedValueOnce(true);
    render(<Trends data={emptyData()} onAssumptions={update} />);
    enterProjection();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save projection" })); });
    expect(screen.getByRole("alert")).toHaveTextContent(/Your entries are kept; retry/);
    expect(screen.getByLabelText("Planned monthly top-up (£)")).toHaveValue(200);
    expect(screen.getByLabelText("Project ahead")).toHaveValue("3");
    expect(screen.getByText("Estimated balance in 1 year")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save projection" })); });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { monthlyDeposit: 20_000, years: 3 });
    expect(update).toHaveBeenNthCalledWith(2, { monthlyDeposit: 20_000, years: 3 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Planned monthly top-up (£)")).not.toBeInTheDocument();
  });
});
