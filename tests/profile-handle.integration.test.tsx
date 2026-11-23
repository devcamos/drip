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
  const user = userEvent.setup(), identity = newIdentity("riverbank"), onRenameIdentity = vi.fn(async (handle: string) => withSuffix({ ...identity, handle }, "4821")), onRenameBusyChange = vi.fn();
  render(<ProfileSettings open identity={identity} counts={{ cash: 2, stocks: 1, credits: 1 }} incomePeriod="month" onIncomePeriod={() => {}} onClose={() => {}} onAccounts={() => {}} onSettings={() => {}} onPayments={() => {}} onFeedback={() => {}} onRenameIdentity={onRenameIdentity} onRenameBusyChange={onRenameBusyChange} signOut={null} />);
  const dialog = within(screen.getByRole("dialog", { name: "Profile & settings" }));
  expect(dialog.getByText("This display name is separate from the gamertag you use to sign in.")).toBeVisible();
  await user.clear(dialog.getByLabelText("Display gamertag")); await user.type(dialog.getByLabelText("Display gamertag"), "newriver");
  await user.click(dialog.getByRole("button", { name: "Save profile gamertag" }));
  expect(onRenameIdentity).toHaveBeenCalledWith("newriver");
  expect(onRenameBusyChange).toHaveBeenNthCalledWith(1, true); expect(onRenameBusyChange).toHaveBeenNthCalledWith(2, false);
  expect(await dialog.findByRole("status")).toHaveTextContent("newriver#4821");
  await user.clear(dialog.getByLabelText("Display gamertag")); await user.type(dialog.getByLabelText("Display gamertag"), "ab");
  await user.click(dialog.getByRole("button", { name: "Save profile gamertag" }));
  expect(dialog.getByRole("alert")).toHaveTextContent("Use at least 3 characters.");
  expect(onRenameIdentity).toHaveBeenCalledTimes(1);
});
