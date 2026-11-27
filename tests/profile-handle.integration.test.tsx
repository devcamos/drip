// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettings } from "../app/accounts/ProfileSettings";
import { newIdentity, withSuffix } from "../lib/identity";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});
afterEach(() => vi.restoreAllMocks());

it("keeps profile naming separate from sign-in and confirms a server-assigned suffix", async () => {
  const user = userEvent.setup(), identity = newIdentity("riverbank"), order: string[] = [];
  const onRenameIdentity = vi.fn(async (handle: string) => { order.push("reserve"); return withSuffix({ ...identity, handle }, "4821"); });
  const confirmRename = vi.fn(async () => { order.push("passkey"); }), onRenameBusyChange = vi.fn();
  render(<ProfileSettings open identity={identity} counts={{ cash: 2, stocks: 1, credits: 1 }} incomePeriod="month" onIncomePeriod={() => {}} onClose={() => {}} onAccounts={() => {}} onSettings={() => {}} onPayments={() => {}} onFeedback={() => {}} onRenameIdentity={onRenameIdentity} confirmRename={confirmRename} onRenameBusyChange={onRenameBusyChange} signOut={null} />);
  const dialog = within(screen.getByRole("dialog", { name: "Profile & settings" }));
  expect(dialog.getByText(/This display name is separate from the gamertag you use to sign in/)).toBeVisible();
  await user.clear(dialog.getByLabelText("Display gamertag")); await user.type(dialog.getByLabelText("Display gamertag"), "newriver");
  await user.click(dialog.getByRole("button", { name: "Save profile gamertag" }));
  expect(onRenameIdentity).toHaveBeenCalledWith("newriver");
  expect(confirmRename).toHaveBeenCalledTimes(1);
  expect(order).toEqual(["passkey", "reserve"]);
  expect(onRenameBusyChange).toHaveBeenNthCalledWith(1, true); expect(onRenameBusyChange).toHaveBeenNthCalledWith(2, false);
  expect(await dialog.findByRole("status")).toHaveTextContent("newriver#4821");
  await user.clear(dialog.getByLabelText("Display gamertag")); await user.type(dialog.getByLabelText("Display gamertag"), "ab");
  await user.click(dialog.getByRole("button", { name: "Save profile gamertag" }));
  expect(dialog.getByRole("alert")).toHaveTextContent("Use at least 3 characters.");
  expect(onRenameIdentity).toHaveBeenCalledTimes(1);
});

it("does not submit a profile rename when the passkey prompt is cancelled", async () => {
  const user = userEvent.setup(), identity = newIdentity("riverbank"), onRenameIdentity = vi.fn(), confirmRename = vi.fn(async () => { throw new Error("A cloud sign-in passkey is required."); });
  render(<ProfileSettings open identity={identity} counts={{ cash: 0, stocks: 0, credits: 0 }} incomePeriod="month" onIncomePeriod={() => {}} onClose={() => {}} onAccounts={() => {}} onSettings={() => {}} onPayments={() => {}} onFeedback={() => {}} onRenameIdentity={onRenameIdentity} confirmRename={confirmRename} signOut={null} />);
  const dialog = within(screen.getByRole("dialog", { name: "Profile & settings" }));
  await user.clear(dialog.getByLabelText("Display gamertag")); await user.type(dialog.getByLabelText("Display gamertag"), "newriver");
  await user.click(dialog.getByRole("button", { name: "Save profile gamertag" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("A cloud sign-in passkey is required.");
  expect(onRenameIdentity).not.toHaveBeenCalled();
});
