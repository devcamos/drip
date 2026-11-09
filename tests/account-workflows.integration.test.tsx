// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => auth }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import Drip from "../app/Drip";
import * as db from "../lib/db";
import * as cloud from "../lib/cloud";
import { encryptBackup, decryptBackup } from "../lib/crypto";
import { archiveAccount } from "../lib/account-lifecycle";
import { applyMarketValuation } from "../lib/market-valuation";
import { AccountForm } from "../app/AccountForm";
import { applyWithdraw, migrateData, ymd } from "../lib/maths";
import { releaseData, releaseDebt, releaseSaver, releaseStock } from "./saved-experience-fixtures";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import * as previousDb from "./fixtures/pre-workflow-client/db";
import * as previousCrypto from "./fixtures/pre-workflow-client/crypto";
import * as previousCloud from "./fixtures/pre-workflow-client/cloud";

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: null }); auth.signOut.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: false })));
  vi.stubGlobal("confirm", vi.fn(() => true));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function () { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function () { this.removeAttribute("open"); } });
});
const nav = (name: string) => within(screen.getByRole("navigation")).getByRole("button", { name });

it("keeps the recorded income basis when a cash-only transfer is confirmed without changing shares", async () => {
  const date = ymd(new Date());
  const priced = applyMarketValuation(releaseStock(), { priceUSD: 100, fxRate: .75, fxDate: date });
  const moved = applyWithdraw(priced, 100, date);
  await seedVault(releaseData([moved]));
  render(<AccountForm existing={moved} onCancel={() => {}} onSave={async account => { await db.mutateData(data => ({ ...data, accounts: [account] })); return true; }} />);
  fireEvent.click(screen.getByLabelText(/I have checked these share details/));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(async () => expect((await db.loadData()).accounts[0].positionReviewRequired).toBeUndefined());
  const saved = (await db.loadData()).accounts[0];
  expect(saved.marketValuation?.recordedBalance).toBe(2400);
  expect(saved.balance).toBe(3650);
});
async function openAccount(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Open ${name}`) }));
  const modal = screen.queryByRole("dialog", { name: /share price/ });
  if (modal) fireEvent.click(within(modal).getByRole("button", { name: "Account details" }));
}

it("warns before losing an unsaved edit, preserves it on cancel, and rejects future transfers", async () => {
  await seedVault(releaseData([releaseSaver()])); render(<Drip />);
  await openAccount("Zopa"); fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Balance", { exact: true }), { target: { value: "6000" } });
  await waitFor(() => expect(screen.getByTestId("local-save-status")).toHaveTextContent("Unsaved changes"));
  vi.mocked(confirm).mockReturnValue(false); fireEvent.click(nav("Accounts"));
  expect(confirm).toHaveBeenCalledWith("Discard your unsaved changes?"); expect(screen.getByLabelText("Balance", { exact: true })).toHaveValue("6000");
  vi.mocked(confirm).mockReturnValue(true); fireEvent.click(nav("Accounts")); await openAccount("Zopa");
  fireEvent.click(screen.getByRole("button", { name: "Top up" }));
  fireEvent.change(screen.getByLabelText("amount", { exact: true }), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("date", { exact: true }), { target: { value: "2099-01-01" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Future transactions");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect((await db.loadData()).accounts[0].balance).toBe(5000);
  // Agreeing to leave, then cancelling deletion, must not mark the draft saved.
  vi.mocked(confirm).mockReturnValueOnce(true).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByTestId("local-save-status")).toHaveTextContent("Unsaved changes");
});

it("round-trips archived history, reviewed positions and paid statements through real encrypted storage, cloud and backup", async () => {
  const data = releaseData([archiveAccount(releaseStock({ payouts: [{ kind: "actual", incomeType: "dividend", amount: 100, date: "2026-11-01" }] })), applyWithdraw(releaseStock({ id: "active-stock" }), 100, ymd(new Date())), releaseDebt({ creditCard: { apr: 24.9, minimumPayment: 35, statementPaid: true } })]);
  await seedVault(data); const stored = await rawStore();
  expect(JSON.stringify(stored)).not.toContain("Barclaycard");
  db.lockLocalVault(); await db.unlockLocalVault(fixtureCode);
  expect((await db.loadData()).accounts).toEqual(migrateData(data, ymd(new Date())).accounts);
  const file = await encryptBackup(data, fixtureCode, 100000); expect(file.v).toBe(4);
  expect(await decryptBackup(file, fixtureCode)).toEqual(data);
  const key = await cloud.cloudKey(fixtureCode), envelope = await cloud.seal(data, key);
  expect(envelope.v).toBe(4); expect((await cloud.unseal(envelope, key)).accounts).toEqual(migrateData(data, ymd(new Date())).accounts);
  await expect(cloud.unseal({ ...envelope, v: 3 }, key)).rejects.toThrow();
});

it("fences the released v3 local writer and rejects v4 backups/cloud before an older client can drop history", async () => {
  const data = releaseData([releaseStock()]);
  await previousDb.commitCloudRestore(data, undefined, await previousCrypto.codeVerifier(fixtureCode), undefined, undefined, fixtureCode);
  await db.unlockLocalVault(fixtureCode);
  await db.mutateData(value => ({ ...value, accounts: value.accounts.map(account => archiveAccount(account)) }));
  const before = await rawStore(), saved = await db.loadData();
  await expect(previousDb.saveData(data)).rejects.toThrow();
  await expect(previousDb.loadData()).rejects.toThrow();
  const backup = await encryptBackup(saved, fixtureCode, 100000);
  await expect(previousCrypto.decryptBackup(backup, fixtureCode)).rejects.toThrow();
  const key = await cloud.cloudKey(fixtureCode), envelope = await cloud.seal(saved, key);
  await expect(previousCloud.unseal(envelope as never, key)).rejects.toThrow("Unsupported cloud copy");
  expect(await rawStore()).toEqual(before);
  previousDb.lockLocalVault(true);
});

it("archives the final holding without losing dividends and restores it from account settings", async () => {
  const day = ymd(new Date()); await seedVault(releaseData([releaseStock({ payouts: [{ kind: "actual", incomeType: "dividend", amount: 100, date: day }] })])); render(<Drip />);
  await openAccount("Realty Income"); fireEvent.click(screen.getByRole("button", { name: "Archive account" }));
  await waitFor(async () => expect((await db.loadData()).accounts[0].archivedAt).toBeTruthy());
  fireEvent.click(nav("Portfolio")); expect(await screen.findByTestId("dividend-income-total")).toHaveTextContent("£100.00");
  fireEvent.click(nav("Settings")); fireEvent.click(screen.getByRole("button", { name: /Archived accounts/ }));
  fireEvent.click(screen.getByRole("button", { name: /Restore Realty Income/ }));
  await waitFor(async () => expect((await db.loadData()).accounts[0].archivedAt).toBeUndefined());
  expect((await db.loadData()).accounts[0].payouts[0].amount).toBe(100);
});

it("pauses stock revaluation after a withdrawal and atomically saves a confirmed closed position", async () => {
  await seedVault(releaseData([releaseStock()])); render(<Drip />); await openAccount("Realty Income");
  fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
  fireEvent.change(screen.getByLabelText("amount", { exact: true }), { target: { value: "2500" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("region", { name: "Share position needs review" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Explore share price/ }));
  const dialog = screen.getByRole("dialog", { name: /share price/ });
  expect(within(dialog).getByRole("button", { name: "Update holding value" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Edit holding details" }));
  fireEvent.change(screen.getByLabelText("Number of shares", { exact: true }), { target: { value: "0" } });
  fireEvent.click(screen.getByLabelText(/I have checked these share details/));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(async () => expect((await db.loadData()).accounts[0].positionReviewRequired).toBeUndefined());
  const saved = (await db.loadData()).accounts[0]; expect(saved.investment?.shares).toBe(0); expect(saved.balance).toBe(0);
});

it("shows a debt due today, records a paid statement without reducing the debt, and clears its reminder", async () => {
  await seedVault(releaseData([releaseDebt({ nextPayoutDate: ymd(new Date()) })])); render(<Drip />);
  fireEvent.click(await screen.findByRole("button", { name: /Payment notifications/ }));
  const today = await screen.findByRole("region", { name: "Today" });
  expect(within(today).getByText("Barclaycard")).toBeInTheDocument(); expect(today).toHaveTextContent("Repayment");
  fireEvent.click(within(today).getByRole("button", { name: "Open" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark statement paid" }));
  await waitFor(async () => expect((await db.loadData()).accounts[0].creditCard?.statementPaid).toBe(true));
  expect((await db.loadData()).accounts[0].balance).toBe(1200);
  fireEvent.click(screen.getByRole("button", { name: /Payment notifications/ }));
  expect(await screen.findByText("No payments expected today.")).toBeInTheDocument();
});

it("guards credit-card edits and projection drafts without saving abandoned inputs", async () => {
  await seedVault(releaseData([releaseDebt(), releaseSaver()])); render(<Drip />);
  await openAccount("Barclaycard"); fireEvent.click(screen.getByRole("button", { name: "Edit credit card" }));
  fireEvent.change(screen.getByLabelText("Statement minimum payment (£)"), { target: { value: "50" } });
  await waitFor(() => expect(screen.getByTestId("local-save-status")).toHaveTextContent("Unsaved"));
  vi.mocked(confirm).mockReturnValue(false); fireEvent.click(nav("Trends"));
  expect(screen.getByLabelText("Statement minimum payment (£)")).toHaveValue("50");
  vi.mocked(confirm).mockReturnValue(true); fireEvent.click(nav("Trends"));
  fireEvent.click(await screen.findByRole("button", { name: "Edit projection" }));
  fireEvent.change(screen.getByLabelText("Planned monthly top-up (£)"), { target: { value: "100" } });
  await waitFor(() => expect(screen.getByTestId("local-save-status")).toHaveTextContent("Unsaved"));
  vi.mocked(confirm).mockReturnValue(false); fireEvent.click(nav("Accounts"));
  expect(screen.getByLabelText("Planned monthly top-up (£)")).toHaveValue(100);
  expect((await db.loadData()).accounts[0].creditCard?.minimumPayment).toBe(35);
  fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
  expect(screen.queryByLabelText("Planned monthly top-up (£)")).not.toBeInTheDocument();
  expect(screen.getByTestId("local-save-status")).toHaveTextContent("Unsaved");
  fireEvent.click(nav("Accounts"));
  expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
  expect(screen.getByLabelText("Planned monthly top-up (£)")).toHaveValue(100);
});

it("resets a projection draft baseline after a successful persisted save and unchanged reopening", async () => {
  await seedVault(releaseData([releaseSaver()])); render(<Drip />);
  await screen.findByRole("region", { name: "Money overview" });
  fireEvent.click(nav("Trends")); fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
  fireEvent.change(screen.getByLabelText("Planned monthly top-up (£)"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save projection" }));
  await waitFor(async () => expect((await db.loadData()).projection?.monthlyDeposit).toBe(100));
  await waitFor(() => expect(screen.queryByLabelText("Planned monthly top-up (£)")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Edit projection" }));
  await waitFor(() => expect(screen.getByTestId("local-save-status")).toHaveTextContent("Saved on this device."));
  vi.mocked(confirm).mockClear(); fireEvent.click(nav("Accounts"));
  expect(confirm).not.toHaveBeenCalled(); expect((await db.loadData()).projection?.monthlyDeposit).toBe(100);
});
