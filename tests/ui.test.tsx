// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { seedVault } from "./storage-fixtures";
import Drip from "@/app/Drip";
import Page from "@/app/page";
import RootLayout, { metadata, viewport } from "@/app/layout";
import { saveData, setItem, loadData, emptyData } from "@/lib/db";
import * as DB from "@/lib/db";
import * as C from "@/lib/crypto";
import * as Diagnostics from "@/lib/diagnostics";
import type { AppData, Account } from "@/lib/types";

const signup = vi.hoisted(() => vi.fn());
vi.mock("../lib/password-login", async importOriginal => ({ ...await importOriginal<typeof import("../lib/password-login")>(), signUpPassword: signup }));
const signupPassword = "Green meadow 42!";
const today = new Date().toISOString().slice(0, 10);
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const tab = (name: string) => fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name }));

function acct(o: Partial<Account> = {}): Account {
  return { id: "a1", provider: "Zopa", label: "Rainy day pot", balance: 3000, ratePct: 7, rateType: "interest", frequency: "monthly",
    nextPayoutDate: today, colour: "#2b2d86", payouts: [], events: [], createdAt: "2026-01-01T00:00:00Z",
    rateHistory: [{ from: "2026-01-01", ratePct: 7 }], ...o };
}

async function seed(d: Partial<AppData>, code = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF") {
  await seedVault({ ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "devo", createdAt: "2026-10-15T00:00:00Z" }, ...d }, code);
  return code;
}

beforeEach(() => {
  localStorage.removeItem("drip-install-task-v1");
  vi.stubGlobal("confirm", () => true);
  signup.mockImplementation(async (_name, _password, data) => { await seedVault(data); });
});

describe("layout and page", () => {
  it("exports metadata and wraps children", () => {
    expect(metadata.title).toBe("Drip");
    expect(viewport.themeColor).toBe("#fffaf1");
    const el = RootLayout({ children: "x" }) as any;
    expect(el.type).toBe("html");
    expect((Page() as any).type).toBe(Drip);
  });
});

describe("onboarding", () => {
  it("offers a retry instead of staying on Loading when signup initialization fails", async () => {
    const drafts = await import("../lib/draft");
    const failure = new Error("Storage unavailable");
    const logged = vi.spyOn(Diagnostics, "logFailure").mockImplementation(() => {});
    vi.spyOn(drafts, "loadDraft").mockRejectedValueOnce(failure);
    render(<Drip />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare signup on this device. Try again.");
    expect(logged).toHaveBeenCalledWith("app.load", failure);
    click("Try again");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByTestId("code")).toBeNull();
  });
  it("keeps registration failures on signup and opens Accounts only after a successful retry", async () => {
    signup.mockRejectedValueOnce(new Error("That gamertag is already used for sign-in. Choose another."));
    render(<Drip />); fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    type(screen.getByLabelText(/Gamertag/), "devo");
    type(screen.getByLabelText("Create password"), signupPassword);
    type(screen.getByLabelText("Confirm new account password"), signupPassword);
    click("Create account");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already used/);
    expect(screen.queryByTestId("header-tag")).toBeNull(); expect(screen.queryByTestId("code")).toBeNull();
    expect(screen.getByLabelText("Create password")).toHaveValue(signupPassword);
    click("Create account"); await screen.findByText(/No accounts yet/);
    expect(within(screen.getByRole("navigation")).getByRole("button", { name: "Accounts" })).toHaveClass("on");
  });
  it("needs a valid gamertag and matching password, then opens Accounts without recovery", async () => {
    render(<Drip />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    const handle = await screen.findByLabelText(/Gamertag/);
    const start = screen.getByRole("button", { name: "Create account" });
    expect(screen.queryByTestId("code")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(start).toBeDisabled();
    type(handle, "a b");
    expect(screen.getByText("Only letters, numbers and underscore.")).toBeInTheDocument();
    type(handle, "devo");
    expect(screen.getByTestId("tag-preview")).toHaveTextContent("You'll be devo");
    type(screen.getByLabelText("Create password"), signupPassword);
    type(screen.getByLabelText("Confirm new account password"), signupPassword);
    click("Create account");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
    expect(screen.getByTestId("header-tag")).toHaveTextContent("devo");
    expect((await loadData()).identity?.handle).toBe("devo");
  });

  it("restores a backup from the welcome screen", async () => {
    const code = C.generateRecoveryCode();
    const backup = await C.encryptBackup({ ...emptyData(), accounts: [acct()], identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "restored", createdAt: "x" } }, code, 100_000);
    render(<Drip />);
    fireEvent.click(await screen.findByRole("button", { name: "Forgot password?" }));
    click("Restore a backup");
    const file = new File([JSON.stringify(backup)], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [file] } });
    type(screen.getByLabelText("Restore recovery code"), C.generateRecoveryCode());
    click("Restore");
    expect(await screen.findByText(/Wrong recovery code/)).toBeInTheDocument();
    type(screen.getByLabelText("Restore recovery code"), code);
    click("Restore");
    expect(await screen.findByText("Rainy day pot")).toBeInTheDocument();
    expect(screen.getByTestId("header-tag")).toHaveTextContent("restored");
  });

  it("rejects a non-Drip file and can go back", async () => {
    render(<Drip />);
    fireEvent.click(await screen.findByRole("button", { name: "Forgot password?" }));
    click("Restore a backup");
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File(["not json"], "x.json")] } });
    type(screen.getByLabelText("Restore recovery code"), "x");
    click("Restore");
    expect(await screen.findByText("That file couldn't be read.")).toBeInTheDocument();
    click("Back");
    expect(screen.getByRole("heading", { name: "Recover your account" })).toBeInTheDocument();
  });
});

describe("migration", () => {
  it("asks an existing install for a gamertag", async () => {
    await seedVault(emptyData());
    render(<Drip />);
    expect(await screen.findByRole("heading", { name: "Pick your gamertag" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save gamertag" });
    expect(save).toBeDisabled();
    type(screen.getByLabelText(/Gamertag/), "old_friend");
    click("Save gamertag");
    expect(await screen.findByTestId("header-tag")).toHaveTextContent("old_friend");
  });
});

describe("accounts", () => {
  it("does not apply queued edits to a replacement backup with the same account id", async () => {
    const code = await seed({ accounts: [acct()] });
    const original = await loadData();
    const backup = await C.encryptBackup({ ...original, accounts: [acct({ balance: 8000 })] }, code, 100_000);
    let fail!: (reason: Error) => void;
    const persist = DB.saveData;
    const writer = vi.spyOn(DB, "saveData").mockImplementation(persist);
    writer.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    render(<Drip />); await screen.findByText("Rainy day pot");
    fireEvent.click(screen.getByRole("button", { name: /Zopa/ }));
    click("Top up"); type(screen.getByLabelText("amount"), "100"); click("Save");
    await waitFor(() => expect(writer).toHaveBeenCalledTimes(1));
    type(screen.getByLabelText("Income amount"), "22.65"); click("Record income");
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File([JSON.stringify(backup)], "replacement.json")] } });
    type(screen.getByLabelText("Restore recovery code"), code); click("Restore");
    await waitFor(async () => expect((await loadData()).accounts[0].balance).toBe(8000));
    await act(async () => fail(new Error("QuotaExceededError")));
    await waitFor(() => expect(screen.getByTestId("local-save-status")).not.toHaveTextContent("Saving"));
    expect(writer).toHaveBeenCalledTimes(1);
    expect((await loadData()).accounts[0]).toMatchObject({ balance: 8000, payouts: [], events: [] });
  });
  it("does not carry a failed edit into another queued action", async () => {
    await seed({ accounts: [acct()] });
    const persist = DB.saveData;
    let fail!: (reason: Error) => void;
    const writer = vi.spyOn(DB, "saveData").mockImplementation(persist);
    writer.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    render(<Drip />); await screen.findByText("Rainy day pot");
    fireEvent.click(screen.getByRole("button", { name: /Zopa/ }));
    click("Top up"); type(screen.getByLabelText("amount"), "100"); click("Save");
    await waitFor(() => expect(writer).toHaveBeenCalledTimes(1));
    type(screen.getByLabelText("Income amount"), "22.65"); click("Record income");
    expect(writer).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("QuotaExceededError")));
    await screen.findByText("Income recorded. Update your balance separately if needed.");
    expect(await screen.findByText("Balance change could not be saved. Your entry is kept; retry.")).toBeInTheDocument();
    const received = (await loadData()).accounts[0];
    expect(received.balance).toBe(3000); expect(received.events).toHaveLength(0); expect(received.payouts).toHaveLength(1);
    click("Save");
    await waitFor(() => expect(screen.queryByRole("form", { name: "Top up" })).toBeNull());
    const retried = (await loadData()).accounts[0];
    expect(retried.balance).toBe(3100); expect(retried.events).toHaveLength(1); expect(retried.payouts).toHaveLength(1);
  });
  it("retries failed top-ups, withdrawals and income without applying them twice", async () => {
    await seed({ accounts: [acct()] });
    const persist = DB.saveData;
    const writer = vi.spyOn(DB, "saveData").mockImplementation(persist);
    render(<Drip />); await screen.findByText("Rainy day pot");
    fireEvent.click(screen.getByRole("button", { name: /Zopa/ }));

    async function retryBalance(action: "Top up" | "Withdraw", amount: string, expected: number, eventType: "topup" | "withdraw") {
      const previous = (await loadData()).accounts[0];
      click(action); type(screen.getByLabelText("amount"), amount);
      writer.mockRejectedValueOnce(new Error("QuotaExceededError")); click("Save");
      await screen.findByText("Changes could not be saved. Your saved data is unchanged; retry the action.");
      await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
      expect((await loadData()).accounts[0]).toEqual(previous);
      expect(document.querySelector(".bal")).toHaveTextContent(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(previous.balance));
      expect(screen.getByLabelText("amount")).toHaveValue(amount);
      click("Save");
      await waitFor(() => expect(screen.queryByRole("form", { name: action })).toBeNull());
      const saved = (await loadData()).accounts[0];
      expect(saved.balance).toBe(expected);
      expect(saved.events!.filter(e => e.type === eventType)).toHaveLength(1);
    }
    await retryBalance("Top up", "100", 3100, "topup");
    await retryBalance("Withdraw", "50", 3050, "withdraw");

    type(screen.getByLabelText("Income amount"), "22.65");
    writer.mockRejectedValueOnce(new Error("QuotaExceededError")); click("Record income");
    await screen.findByText("Income could not be saved. Keep Drip open and retry.");
    expect((await loadData()).accounts[0].payouts).toHaveLength(0);
    expect(screen.getByLabelText("Income amount")).toHaveValue("22.65");
    click("Record income");
    await screen.findByText("Income recorded. Update your balance separately if needed.");
    const saved = (await loadData()).accounts[0];
    expect(saved.balance).toBe(3050);
    expect(saved.payouts).toEqual([{ date: today, amount: 22.65, kind: "actual", incomeType: "interest" }]);
    expect(screen.queryByText("Changes could not be saved. Your saved data is unchanged; retry the action.")).toBeNull();
  });
  it("shows a balance change as saved only after the encrypted write completes", async () => {
    await seed({ accounts: [acct()] });
    const persist = DB.saveData;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(DB, "saveData").mockImplementation(async data => { await gate; await persist(data); });
    render(<Drip />); await screen.findByText("Rainy day pot");
    fireEvent.click(screen.getByRole("button", { name: /Zopa/ }));
    click("Update balance"); type(screen.getByLabelText("amount"), "3200"); click("Save");
    expect(screen.getByTestId("local-save-status")).toHaveTextContent("Saving changes…");
    expect(document.querySelector(".bal")).toHaveTextContent("£3,000.00");
    expect((await loadData()).accounts[0].balance).toBe(3000);
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId("local-save-status")).toHaveTextContent("Saved on this device."));
    expect(document.querySelector(".bal")).toHaveTextContent("£3,200.00");
    expect((await loadData()).accounts[0].balance).toBe(3200);
  });
  it("adds an account with a custom provider, then edits, tops up, withdraws, sets balance, logs payout, changes rate, deletes", async () => {
    await seed({});
    render(<Drip />);
    click(await screen.findByRole("button", { name: "Add account" }).then(() => "Add account"));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "Other" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    type(screen.getByLabelText("Provider name"), "My Bank");
    type(screen.getByLabelText("Nickname"), "Pot");
    type(screen.getByLabelText("Balance"), "1200");
    type(screen.getByLabelText("Rate"), "5");
    fireEvent.change(screen.getByLabelText("Product category"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "dividend" } });
    fireEvent.change(screen.getByLabelText("Paid"), { target: { value: "quarterly" } });
    type(screen.getByLabelText("Next payout date"), today);
    expect(screen.getByText("≈ £5.00 a month")).toBeInTheDocument();
    click("Save");

    // detail
    expect(await screen.findByText("My Bank")).toBeInTheDocument();
    expect(await screen.findByText("Estimated next payment")).toBeInTheDocument();

    click("Top up");
    type(screen.getByLabelText("amount"), "300");
    type(screen.getByLabelText("date"), today);
    click("Save");
    expect(await screen.findByTestId("events")).toHaveTextContent("+£300.00");

    click("Withdraw");
    type(screen.getByLabelText("amount"), "99999");
    click("Save");
    expect(screen.getByText("You can't withdraw more than the balance.")).toBeInTheDocument();
    type(screen.getByLabelText("amount"), "100");
    click("Save");
    expect(await screen.findByText("−£100.00")).toBeInTheDocument();

    click("Update balance");
    expect(screen.getByLabelText("amount")).toHaveValue("1400");
    type(screen.getByLabelText("amount"), "1450");
    click("Save");
    expect(await screen.findByText("Balance set")).toBeInTheDocument();

    click("Withdraw"); click("Cancel");

    type(screen.getByLabelText("Income amount"), "20");
    type(screen.getByLabelText("Income date"), today);
    click("Record income");
    expect(await screen.findByTestId("income-history")).toHaveTextContent("£20.00");

    // edit with rate change -> rate history
    click("Edit");
    expect(screen.getByRole("heading", { name: "Edit account" })).toBeInTheDocument();
    type(screen.getByLabelText("Rate"), "4");
    type(screen.getByLabelText("New rate applies from"), "2026-01-02");
    click("Save");
    expect(await screen.findByText("Rate history")).toBeInTheDocument();
    expect(screen.getByText("4%")).toBeInTheDocument();

    // edit without rate change + cancel path
    click("Edit"); click("Cancel");
    expect(await screen.findByText("Total balance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /My Bank/ }));
    click("Delete");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
  }, 30_000);

  it("home shows stacked cards and upcoming payouts; back button works", async () => {
    await seed({ accounts: [acct(), acct({ id: "a2", provider: "Chip", label: "", balance: 1000, ratePct: 3 })] });
    render(<Drip />);
    expect(await screen.findByText("£4,000.00")).toBeInTheDocument();
    expect(screen.getByText("Upcoming estimated payments")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Chip/ }));
    expect(await screen.findByText("No income logged yet.")).toBeInTheDocument();
    click("← Accounts");
    expect(screen.getByText("Total balance")).toBeInTheDocument();
  });
});

describe("trends", () => {
  it("shows stats, breakdown and projection", async () => {
    const m = (o: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + o); return d.toISOString().slice(0, 7); };
    await seed({ accounts: [acct()], snapshots: [{ month: m(-1), totalBalance: 2500, monthlyIncome: 10 }, { month: m(0), totalBalance: 3000, monthlyIncome: 17.5, deposits: 600, withdrawals: 117.5 }] });
    render(<Drip />);
    await screen.findByText("Total balance");
    tab("Trends");
    expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
    expect(screen.getByText("This month vs last")).toBeInTheDocument();
    expect(screen.getByText("£600.00")).toBeInTheDocument();
    expect(screen.getByText("−£117.50")).toBeInTheDocument();
    expect(screen.getByText("Estimated balance in 1 year")).toBeInTheDocument();
  });
  it("explains missing history", async () => {
    await seed({ accounts: [] });
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Trends");
    expect(screen.getByText(/appears after Drip has two months/)).toBeInTheDocument();
  });
});

describe("backup", () => {
  it("export checks the code and downloads an encrypted file; restore replaces data", async () => {
    const code = await seed({ accounts: [acct()] });
    let blob: Blob | null = null;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => { blob = b; return "blob:x"; }, revokeObjectURL: vi.fn() }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Drip />);
    await screen.findByText("Total balance");
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    type(screen.getByLabelText("Export recovery code"), "WRONG");
    click("Export backup");
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    type(screen.getByLabelText("Export recovery code"), code);
    click("Export backup");
    expect(await screen.findByText("Backup saved.", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(clickSpy).toHaveBeenCalled();
    const file = JSON.parse(await blob!.text());
    expect(file.app).toBe("drip");
    await waitFor(async () => expect((await loadData()).lastBackupAt).not.toBeNull());

    // restore a different backup over it
    const other = await C.encryptBackup({ ...emptyData(), accounts: [acct({ provider: "Plum", label: "From backup" })] }, code, 100_000);
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File([JSON.stringify(other)], "b.json")] } });
    type(screen.getByLabelText("Restore recovery code"), code);
    click("Restore");
    await waitFor(async () => expect((await loadData()).accounts[0].provider).toBe("Plum"));
  });

  it("uses the share sheet when available and handles share errors", async () => {
    const code = await seed({ accounts: [acct()] });
    const failure = new Error("boom");
    const logged = vi.spyOn(Diagnostics, "logFailure").mockImplementation(() => {});
    const share = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" })).mockRejectedValueOnce(failure);
    Object.assign(navigator, { canShare: () => true, share });
    render(<Drip />);
    await screen.findByText("Total balance");
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    type(screen.getByLabelText("Export recovery code"), code);
    click("Export backup");
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Export backup" })).toBeEnabled());
    expect(screen.queryByText("Backup failed. Please try again.")).toBeNull();
    expect(logged).not.toHaveBeenCalledWith("backup.export", expect.anything());
    click("Export backup");
    expect(await screen.findByText("Backup failed. Please try again.", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("backup.export", failure);
    delete (navigator as any).canShare; delete (navigator as any).share;
  });

  it("restore rejects invalid backup contents", async () => {
    const logged = vi.spyOn(Diagnostics, "logFailure").mockImplementation(() => {});
    const code = await seed({});
    const bad = await C.encryptBackup({ version: 9 }, code, 100_000);
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File([JSON.stringify(bad)], "b.json")] } });
    type(screen.getByLabelText("Restore recovery code"), code);
    click("Restore");
    expect(await screen.findByText("The backup's contents aren't valid.")).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("backup.restore", expect.any(C.BackupError));
  });
});

describe("banners", () => {
  it("iOS install task omits old warnings and can be dismissed", async () => {
    await seed({});
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    Object.defineProperty(navigator, "storage", { configurable: true, value: { persisted: async () => false, persist: async () => false } });
    render(<Drip />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/may clear Drip's data/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss install task" }));
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
    expect(screen.queryByText(/may clear Drip's data/)).toBeNull();
    delete (navigator as any).storage;
  });
  it("Android install prompt and backup reminder dismissal", async () => {
    await seed({ accounts: [acct()], lastBackupAt: "2020-01-01T00:00:00Z" });
    render(<Drip />);
    await screen.findByText("Total balance");
    const prompt = vi.fn();
    act(() => { const e = new Event("beforeinstallprompt"); (e as any).prompt = prompt; window.dispatchEvent(e); });
    expect(await screen.findByRole("region", { name: "Install Drip task" })).toBeInTheDocument();
    click("Install");
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByText(/over 2 weeks since your last backup/)).toBeNull();
  });
});

describe("app lock", () => {
  const raw = new Uint8Array([1, 2, 3]).buffer; const credId = "AQID";
  it("turns on with a passkey and off again; says it's a screen lock only", async () => {
    await seed({});
    vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
    const create = vi.fn(async () => ({ rawId: raw }));
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { create, get: vi.fn() } });
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    expect(screen.getByText(/screen lock only/)).toBeInTheDocument();
    expect(screen.getByTestId("settings-tag")).toHaveTextContent("devo");
    expect(screen.getByText(/unique gamertag saved/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on app lock" })).toBeEnabled());
    click("Turn on app lock");
    expect(await screen.findByText("App lock is on.")).toBeInTheDocument();
    expect((create.mock.calls[0] as any)[0].publicKey.user.name).toBe("devo");
    await waitFor(async () => expect((await loadData()).lock?.credentialId).toBe(credId));
    click("Turn off app lock");
    expect(await screen.findByText("App lock is off.")).toBeInTheDocument();
  });
  it("reports failure to create a passkey, and unsupported devices", async () => {
    const logged = vi.spyOn(Diagnostics, "logFailure").mockImplementation(() => {});
    await seed({});
    vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: async () => null, get: vi.fn() } });
    const { unmount } = render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on app lock" })).toBeEnabled());
    click("Turn on app lock");
    expect(await screen.findByText("Couldn't set up the passkey.")).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("auth", expect.any(Error));
    unmount();
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Settings"); fireEvent.click(screen.getByText("Advanced: file backups & app lock"));
    expect(await screen.findByText(/doesn't support a passkey lock/)).toBeInTheDocument();
  });
  it("locks on open, unlocks by passkey or recovery code, and relocks after 5 minutes hidden", async () => {
    const logged = vi.spyOn(Diagnostics, "logFailure").mockImplementation(() => {});
    const code = await seed({ lock: { credentialId: credId, enabledAt: "x" } });
    const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ rawId: raw });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: vi.fn(), get } });
    render(<Drip />);
    expect(await screen.findByRole("heading", { name: /locked/ })).toBeInTheDocument();
    expect(await screen.findByText(/Face ID didn't work/)).toBeInTheDocument();
    const recovery = await import("../lib/recovery-codes");
    const failure = new Error("Synthetic recovery lookup failure");
    vi.spyOn(recovery, "resolveRecoveryCode").mockRejectedValueOnce(failure);
    type(screen.getByLabelText("Unlock recovery code"), code);
    click("Unlock with code");
    expect(await screen.findByText(failure.message)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("auth", failure);
    expect(screen.getByRole("heading", { name: /locked/ })).toBeInTheDocument();
    type(screen.getByLabelText("Unlock recovery code"), "WRONG");
    click("Unlock with code");
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    type(screen.getByLabelText("Unlock recovery code"), code);
    click("Unlock with code");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();

    // background for 5+ minutes -> locked again; passkey unlocks
    const now = Date.now(); const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    const vis = (v: string) => { Object.defineProperty(document, "visibilityState", { configurable: true, value: v }); document.dispatchEvent(new Event("visibilitychange")); };
    act(() => vis("hidden"));
    spy.mockReturnValue(now + 60_000);
    act(() => vis("visible"));
    expect(screen.queryByRole("heading", { name: /locked/ })).toBeNull();
    act(() => vis("hidden"));
    spy.mockReturnValue(now + 6 * 60_000);
    act(() => vis("visible"));
    expect(await screen.findByRole("heading", { name: /locked/ })).toBeInTheDocument();
    click("Unlock with Face ID / passkey");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
  });
});

describe("onboarding draft persistence", () => {
  it("keeps the unsent gamertag in memory but clears passwords after leaving and coming back", async () => {
    const first = render(<Drip />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    await screen.findByLabelText(/Gamertag/);
    type(screen.getByLabelText(/Gamertag/), "devo");
    await waitFor(async () => expect((await (await import("@/lib/draft")).loadDraft())?.handle).toBe("devo"));
    first.unmount();
    render(<Drip />);
    await screen.findByLabelText(/Gamertag/);
    expect(screen.queryByTestId("code")).toBeNull();
    expect(screen.getByLabelText(/Gamertag/)).toHaveValue("devo");
    type(screen.getByLabelText("Create password"), signupPassword);
    type(screen.getByLabelText("Confirm new account password"), signupPassword);
    click("Create account");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
    expect(await (await import("@/lib/draft")).loadDraft()).toBeNull();
  });
});

describe("daily interest accounts", () => {
  it("adds a daily account without a payout date and shows 'Daily interest'", async () => {
    await seed({ accounts: [acct({ id: "m", provider: "Zopa", nextPayoutDate: today })] });
    render(<Drip />);
    await screen.findByText("Total balance");
    tab("Add");
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "MoneyFarm" } });
    type(screen.getByLabelText("Balance"), "10000");
    type(screen.getByLabelText("Rate"), "3.65");
    fireEvent.change(screen.getByLabelText("Paid"), { target: { value: "daily" } });
    expect(screen.queryByLabelText("Next payout date")).toBeNull();
    expect(screen.getByText(/no payout date/)).toBeInTheDocument();
    click("Save");
    expect(await screen.findByText("Per day (est.)")).toBeInTheDocument();
    expect(screen.getByText("No income logged yet.")).toBeInTheDocument();
    click("← Accounts");
    expect(screen.getByText(/Daily payments/)).toBeInTheDocument();
    const up = screen.getByText("Upcoming estimated payments").closest(".panel")!;
    expect(within(up as HTMLElement).queryByText("MoneyFarm")).toBeNull();
  });
  it("keeps an older daily balance authoritative on open and separates legacy estimates", async () => {
    const past = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    await seed({ accounts: [acct({ id: "d", provider: "MoneyFarm", label: "", balance: 10000, ratePct: 3.65, frequency: "daily", accruedThrough: past, events: [{ type: "interest", date: past, amount: 12 }], rateHistory: [{ from: "2020-01-01", ratePct: 3.65 }] })] });
    render(<Drip />);
    await screen.findByText("Total balance");
    expect((await loadData()).accounts[0]).toMatchObject({ balance: 10000, accruedThrough: past });
    fireEvent.click(screen.getByRole("button", { name: /MoneyFarm/ }));
    expect(await screen.findByText("Previous interest estimates")).toBeInTheDocument();
    expect(screen.getByText("No income logged yet.")).toBeInTheDocument();
    expect(screen.getByText(/Your saved balance has been preserved/)).toBeInTheDocument();
  });
});

describe("sign-out", () => {
  it("keeps accounts hidden across remount and reopens the local copy only with its code", async () => {
    const code = await seed({ accounts: [acct()] });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: false })));
    const first = render(<Drip />); await screen.findByText("Total balance");
    click("Sign out");
    expect(await screen.findByRole("heading", { name: "Drip is signed out" })).toBeInTheDocument();
    expect(screen.queryByText("Rainy day pot")).toBeNull();
    first.unmount(); render(<Drip />);
    await screen.findByRole("heading", { name: "Drip is signed out" });
    click("Forgot password?");
    type(screen.getByLabelText("Recovery code"), "wrong"); click("Sign in");
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    type(screen.getByLabelText("Recovery code"), code); click("Sign in");
    expect(await screen.findByText("Rainy day pot")).toBeInTheDocument();
    expect((await loadData()).accounts[0].balance).toBe(3000);
  });
  it("does not let delayed startup overwrite a sign-out from another tab", async () => {
    await seed({ accounts: [acct()] });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: false })));
    const db = await import("../lib/db"); const saved = await loadData();
    let release!: (value: AppData) => void;
    const spy = vi.spyOn(db, "loadData").mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    render(<Drip />);
    await waitFor(() => expect(release).toBeDefined());
    await setItem("deviceSession", { signedOut: true, remotePending: false, generation: "from-another-tab" });
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "drip-session-notify" })); });
    await screen.findByRole("heading", { name: "Drip is signed out" });
    await act(async () => { release(saved); });
    expect(screen.getByRole("heading", { name: "Drip is signed out" })).toBeInTheDocument();
    expect(screen.queryByText("Rainy day pot")).toBeNull(); spy.mockRestore();
  });
});
