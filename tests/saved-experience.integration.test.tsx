// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => auth }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import * as db from "../lib/db";
import { applyWithdraw, migrateData } from "../lib/maths";
import * as cloud from "../lib/cloud";
import * as cryptoFiles from "../lib/crypto";
import * as oldDb from "./fixtures/pre-debt-client/db";
import * as oldCloud from "./fixtures/pre-debt-client/cloud";
import * as oldCrypto from "./fixtures/pre-debt-client/crypto";
import { applyMarketValuation } from "../lib/market-valuation";
import { CreditCardForm } from "../app/CreditCardForm";
import Drip from "../app/Drip";
import { releaseData, releaseDebt, releaseHoldingsAndDebts, releaseIdentity, releaseSaver, releaseStock } from "./saved-experience-fixtures";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import type { AppData } from "../lib/types";

const at = Date.parse("2026-11-07T12:00:00Z");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
let otherTab: typeof db | undefined;
async function seedOld(data = releaseData([releaseSaver(), releaseStock()]), state?: Parameters<typeof oldDb.commitCloudRestore>[1]) {
  if (!oldDb.isAppData(data)) throw new Error("Invalid frozen-client fixture");
  await oldDb.commitCloudRestore(data, state, await oldCrypto.codeVerifier(fixtureCode), undefined, undefined, fixtureCode);
  const version = await new Promise<number>((resolve, reject) => { const q = indexedDB.open("drip"); q.onsuccess = () => { resolve(q.result.version); q.result.close(); }; q.onerror = () => reject(q.error); });
  expect(version).toBe(2);
  return data;
}
beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: null }); auth.signOut.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: false })));
  vi.stubGlobal("confirm", vi.fn(() => true));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function () { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function () { this.removeAttribute("open"); } });
});
afterEach(() => { oldDb.lockLocalVault(true); otherTab?.lockLocalVault(true); otherTab = undefined; });

it("round-trips multiple real encrypted debts and valued holdings while preserving legacy formats and the original recovery wrapper", async () => {
  const accounts = releaseHoldingsAndDebts();
  accounts[1] = applyMarketValuation(accounts[1], { priceUSD: 100, fxRate: 0.75, fxDate: "2026-11-06" }, at);
  accounts[1] = applyWithdraw(accounts[1], 100, "2026-11-07");
  expect(accounts[1].marketValuation?.recordedBalance).toBe(2400);
  expect(accounts[1].marketValuation?.priceUSD).toBe(100);
  const data = releaseData(accounts); await seedVault(data);
  const stored = await rawStore();
  expect(stored.data.app).toBe("drip-local-data");
  expect(JSON.stringify(stored)).not.toContain("Barclaycard");
  db.lockLocalVault(); expect((await db.unlockLocalVault(fixtureCode)).data).toEqual(migrateData(data, "2026-11-07"));
  const backup = await cryptoFiles.encryptBackup(data, fixtureCode, 100000);
  expect(backup.v).toBe(3); expect(await cryptoFiles.decryptBackup(backup, fixtureCode)).toEqual(data);
  await expect(oldCrypto.decryptBackup(backup, fixtureCode)).rejects.toThrow();
  await expect(cryptoFiles.decryptBackup({ ...backup, v: 2 }, fixtureCode)).rejects.toThrow();
  const key = await cloud.cloudKey(fixtureCode), envelope = await cloud.seal(data, key);
  expect(envelope.v).toBe(3); expect((await cloud.unseal(envelope, key)).accounts).toEqual(migrateData(data, "2026-11-07").accounts);
  await expect(oldCloud.unseal(envelope as never, key)).rejects.toThrow("Unsupported cloud copy");
  await expect(cloud.unseal({ ...envelope, v: 2 }, key)).rejects.toThrow();
  for (const legacy of [releaseData([releaseSaver()]), releaseData([releaseStock()])]) {
    if (!oldDb.isAppData(legacy)) throw new Error("Invalid frozen-client fixture");
    const oldBackup = await oldCrypto.encryptBackup(legacy, fixtureCode, 100000);
    const oldEnvelope = await oldCloud.seal(legacy, key);
    expect(await cryptoFiles.decryptBackup(oldBackup, fixtureCode)).toEqual(legacy);
    expect(await cloud.unseal(oldEnvelope, key)).toEqual(migrateData(legacy, "2026-11-07"));
  }
  const original = { app: "drip-recovery-codes", codes: Array.from({ length: 6 }, (_, i) => `original-${i}`) };
  const wrapper = await oldCrypto.encryptBackup(original, fixtureCode, 100000);
  expect(wrapper.v).toBe(1); expect(await cryptoFiles.decryptBackup(wrapper, fixtureCode)).toEqual(original);
  expect((await rawStore()).localVault).toEqual(stored.localVault);
});

it("fences the frozen actual DB2 tab before first sync without replacing vault or recovery metadata", async () => {
  const stale = await seedOld();
  await rawStore({ originalRecoveryCodes: { immutable: "original-encrypted-wrapper" }, recoveryCodesSaved: true });
  const before = await rawStore(); await db.unlockLocalVault(fixtureCode);
  await db.mutateData(current => ({ ...current, accounts: [...current.accounts, releaseDebt()] }));
  const latest = await rawStore();
  await expect(oldDb.saveData({ ...stale, accounts: [] })).rejects.toThrow();
  await expect(oldDb.loadData()).rejects.toThrow();
  await expect(oldDb.cloudSnapshot()).rejects.toThrow();
  expect(await rawStore()).toEqual(latest);
  expect(latest.localVault).toEqual(before.localVault); expect(latest.verifier).toEqual(before.verifier);
  expect(latest.originalRecoveryCodes).toEqual(before.originalRecoveryCodes);
  expect(latest.recoveryCodesSaved).toBe(true);
  expect((await db.loadData()).accounts.map(a => a.id)).toEqual(["cash", "stock", "credit"]);
});

it("rejects a frozen DB2 save already encrypting when a new tab upgrades and saves debt", async () => {
  const stale = await seedOld(); const entered = deferred(), release = deferred();
  const original = crypto.subtle.encrypt.bind(crypto.subtle);
  const encrypt = vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => {
    const result = await original(...args); entered.resolve(); await release.promise; return result;
  });
  const result = oldDb.saveData({ ...stale, accounts: [] }).then(() => null, error => error);
  await entered.promise; encrypt.mockRestore();
  await db.unlockLocalVault(fixtureCode); await db.mutateData(value => ({ ...value, accounts: [...value.accounts, releaseDebt()] }));
  const safe = await rawStore(); release.resolve(); expect(await result).toBeInstanceOf(Error);
  expect(await rawStore()).toEqual(safe); expect((await db.loadData()).accounts).toHaveLength(3);
});

it("makes the actual old same-revision cloud sync GET-only before cleanup or acknowledgement of a v3 remote copy", async () => {
  const key = await cloud.cloudKey(fixtureCode);
  await seedOld(undefined, { userId: "owner", identityId: releaseIdentity.id, key, version: 7, dirty: false, generation: "old-tab", revision: 0, lastSyncAt: null });
  await rawStore({ browserDeviceId: "11111111-1111-4111-8111-111111111111" });
  const remote = await cloud.seal(releaseData(releaseHoldingsAndDebts()), key), before = await rawStore();
  auth.getSession.mockResolvedValue({ data: { user: { id: "owner" } } });
  const fetcher = vi.fn().mockResolvedValue(Response.json({ version: 7, envelope: remote })); vi.stubGlobal("fetch", fetcher);
  await expect(oldCloud.syncNow()).rejects.toThrow("Unsupported cloud copy");
  expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1].method).toBe("GET");
  expect(await rawStore()).toEqual(before); expect((await oldDb.loadData()).accounts).toHaveLength(2);
});

it("retries one same-owner encrypted record conflict, drains accepted work, and rejects mutations after the key binding changes", async () => {
  await seedVault(releaseData([releaseSaver(), releaseStock()]));
  vi.resetModules(); otherTab = await import("../lib/db"); await otherTab.unlockLocalVault(fixtureCode);
  const bothEntered = deferred(), release = deferred(); const original = crypto.subtle.encrypt.bind(crypto.subtle); let entered = 0;
  const encrypt = vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
    const value = await original(...args); entered += 1;
    if (entered <= 2) { if (entered === 2) bothEntered.resolve(); await release.promise; }
    return value;
  });
  const first = db.mutateData(value => ({ ...value, accounts: [...value.accounts, releaseDebt()] }));
  const second = otherTab.mutateData(value => ({ ...value, accounts: [...value.accounts, releaseDebt({ id: "credit-2", provider: "Lloyds" })] }));
  await bothEntered.promise; release.resolve(); await Promise.all([first, second]); encrypt.mockRestore();
  expect((await db.loadData()).accounts.map(a => a.id).sort()).toEqual(["cash", "credit", "credit-2", "stock"]);
  expect(entered).toBe(3);
  const pending = db.mutateData(value => ({ ...value, lastBackupAt: "2026-11-07" }));
  await db.prepareLocalSignOut(); await pending;
  await expect(db.mutateData(value => value)).rejects.toThrow("Sign-out is in progress");
  expect((await db.loadData()).lastBackupAt).toBe("2026-11-07"); db.cancelLocalSignOut();
  const paused = deferred(), finish = deferred();
  vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (...args) => { const value = await original(...args); paused.resolve(); await finish.promise; return value; });
  const changed = db.mutateData(value => ({ ...value, accounts: [] })).then(() => null, error => error);
  await paused.promise; db.lockLocalVault(true); finish.resolve();
  expect(await changed).toBeInstanceOf(Error); await db.unlockLocalVault(fixtureCode);
  expect((await db.loadData()).accounts).toHaveLength(4);
});

it("keeps a real credit-card form entry intact through validation and save failure, then commits a retry once", async () => {
  await seedVault(releaseData([releaseSaver()]));
  const save = vi.fn().mockResolvedValueOnce(false).mockImplementation(async (account: AppData["accounts"][number]) => { await db.mutateData(value => ({ ...value, accounts: [...value.accounts, account] })); return true; });
  const cancel = vi.fn(); render(<CreditCardForm onSave={save} onCancel={cancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Add credit card" }));
  expect(await screen.findByText(/Enter a credit card provider/)).toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
  for (const [label, value] of [["Credit card provider", "Lloyds"], ["Amount owed (£)", "625.12"], ["APR (%)", "19.9"], ["Statement minimum payment (£)", "25"], ["Planned payment (£, optional)", "60"], ["Payment due date", "2026-11-25"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Add credit card" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your saved figures are unchanged");
  expect(screen.getByLabelText("Amount owed (£)")).toHaveValue("625.12"); expect((await db.loadData()).accounts).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Add credit card" })); await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await waitFor(async () => expect((await db.loadData()).accounts).toHaveLength(2));
  const saved = (await db.loadData()).accounts[1]; expect(saved.creditCard).toEqual({ apr: 19.9, minimumPayment: 25, plannedPayment: 60 }); expect(saved.ratePct).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(cancel).toHaveBeenCalledOnce();
});

it("uses real saved accounts in profile, debt detail, owner-scoped preference and the actual sign-out encryption gate", async () => {
  const data = releaseData(releaseHoldingsAndDebts()); await seedVault(data); render(<Drip />);
  const avatar = await screen.findByRole("button", { name: /Open profile and settings/ }); fireEvent.click(avatar);
  const profile = await screen.findByRole("dialog", { name: "Profile & settings" });
  const counts = within(profile).getByRole("region", { name: "Your profile accounts" });
  expect(counts).toHaveTextContent("Savings1"); expect(counts).toHaveTextContent("Holdings2"); expect(counts).toHaveTextContent("Credit cards2");
  fireEvent.click(within(profile).getByRole("button", { name: "Yearly" }));
  await waitFor(() => expect(within(profile).getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "true"));
  await waitFor(async () => expect((await rawStore())[`income-period:${releaseIdentity.id}`]).toBe("year"));
  fireEvent.click(within(profile).getByRole("button", { name: /Manage accounts/ }));
  fireEvent.click(screen.getByRole("button", { name: /Barclaycard/ }));
  expect(await screen.findByRole("heading", { name: "Your payment plan" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Credit card payment plan" })).toHaveTextContent("24.9%");
  fireEvent.click(screen.getByRole("button", { name: "Edit credit card" }));
  fireEvent.change(screen.getByLabelText("Planned payment (£, optional)"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(async () => expect((await db.loadData()).accounts.find(a => a.id === "credit")?.creditCard?.plannedPayment).toBe(90));
  fireEvent.click(screen.getByRole("button", { name: /Open profile and settings/ }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Profile & settings" })).getByRole("button", { name: "Close profile and settings" }));
  fireEvent.click(screen.getByRole("button", { name: /Open profile and settings/ }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Profile & settings" })).getByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("heading", { name: "Sign in to Drip" })).toBeInTheDocument();
  expect(screen.queryByText("Your payment plan")).toBeNull();
  await expect(db.loadData()).rejects.toThrow();
  const stored = await rawStore(); expect(stored.data.app).toBe("drip-local-data"); expect(stored[`income-period:${releaseIdentity.id}`]).toBe("year");
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  fireEvent.change(screen.getByLabelText("Recovery code", { exact: true }), { target: { value: fixtureCode } });
  fireEvent.click(screen.getByRole("button", { name: "Recover account" }));
  await screen.findByRole("button", { name: /Open profile and settings/ });
  expect((await db.loadData()).accounts).toHaveLength(5); expect((await db.loadData()).accounts.find(a => a.id === "credit")?.creditCard?.plannedPayment).toBe(90);
});
