// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import Drip from "@/app/Drip";
import Page from "@/app/page";
import RootLayout, { metadata, viewport } from "@/app/layout";
import { saveData, setItem, loadData, emptyData } from "@/lib/db";
import * as C from "@/lib/crypto";
import type { AppData, Account } from "@/lib/types";

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
  await saveData({ ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "devo", createdAt: "2026-10-15T00:00:00Z" }, ...d });
  await setItem("verifier", await C.codeVerifier(code));
  return code;
}

beforeEach(() => {
  vi.stubGlobal("confirm", () => true);
});

describe("layout and page", () => {
  it("exports metadata and wraps children", () => {
    expect(metadata.title).toBe("Drip");
    expect(viewport.themeColor).toBe("#0b1020");
    const el = RootLayout({ children: "x" }) as any;
    expect(el.type).toBe("html");
    expect((Page() as any).type).toBe(Drip);
  });
});

describe("onboarding", () => {
  it("needs a valid gamertag and saved code, then starts", async () => {
    render(<Drip />);
    const handle = await screen.findByLabelText(/Gamertag/);
    const start = screen.getByRole("button", { name: "Start" });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(start).toBeDisabled();
    type(handle, "a b");
    expect(screen.getByText("Only letters, numbers and underscore.")).toBeInTheDocument();
    type(handle, "devo");
    expect(screen.getByTestId("tag-preview")).toHaveTextContent("You'll be devo");
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText: vi.fn() } }));
    click("Copy");
    click("Start");
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
    expect(screen.getByTestId("header-tag")).toHaveTextContent("devo");
    expect((await loadData()).identity?.handle).toBe("devo");
  });

  it("restores a backup from the welcome screen", async () => {
    const code = C.generateRecoveryCode();
    const backup = await C.encryptBackup({ ...emptyData(), accounts: [acct()], identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "restored", createdAt: "x" } }, code, 100_000);
    render(<Drip />);
    click(await screen.findByRole("button", { name: "Restore a backup" }).then(() => "Restore a backup"));
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
    await screen.findByRole("button", { name: "Restore a backup" });
    click("Restore a backup");
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File(["not json"], "x.json")] } });
    type(screen.getByLabelText("Restore recovery code"), "x");
    click("Restore");
    expect(await screen.findByText("That file couldn't be read.")).toBeInTheDocument();
    click("Back");
    expect(screen.getByText("Your recovery code")).toBeInTheDocument();
  });
});

describe("migration", () => {
  it("asks an existing install for a gamertag", async () => {
    await saveData(emptyData());
    await setItem("verifier", await C.codeVerifier("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF"));
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
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "dividend" } });
    fireEvent.change(screen.getByLabelText("Paid"), { target: { value: "quarterly" } });
    type(screen.getByLabelText("Next payout date"), today);
    expect(screen.getByText("≈ £5.00 a month")).toBeInTheDocument();
    click("Save");

    // detail
    expect(await screen.findByText("My Bank")).toBeInTheDocument();
    expect(screen.getByText("Expected (quarterly)")).toBeInTheDocument();

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

    type(screen.getByLabelText("Payout amount"), "20");
    type(screen.getByLabelText("Payout date"), today);
    click("Log payout");
    expect(await screen.findByText(/expected £18\.13/)).toBeInTheDocument();

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
    expect(screen.getByText("Upcoming payouts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Chip/ }));
    expect(await screen.findByText("No payouts logged yet.")).toBeInTheDocument();
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
    expect(screen.getByText(/In 12 months:/)).toBeInTheDocument();
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
    expect(await screen.findByText(/haven't backed up yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back up" }));
    expect(screen.getByRole("heading", { name: /Backup/ })).toBeInTheDocument();
    type(screen.getByLabelText("Export recovery code"), "WRONG");
    click("Export backup");
    expect(await screen.findByText("That isn't your recovery code.")).toBeInTheDocument();
    type(screen.getByLabelText("Export recovery code"), code);
    click("Export backup");
    expect(await screen.findByText("Backup saved.", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(clickSpy).toHaveBeenCalled();
    const file = JSON.parse(await blob!.text());
    expect(file.app).toBe("drip");
    expect((await loadData()).lastBackupAt).not.toBeNull();

    // restore a different backup over it
    const other = await C.encryptBackup({ ...emptyData(), accounts: [acct({ provider: "Plum", label: "From backup" })] }, code, 100_000);
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File([JSON.stringify(other)], "b.json")] } });
    type(screen.getByLabelText("Restore recovery code"), code);
    click("Restore");
    await waitFor(async () => expect((await loadData()).accounts[0].provider).toBe("Plum"));
  });

  it("uses the share sheet when available and handles share errors", async () => {
    const code = await seed({ accounts: [acct()] });
    const share = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" })).mockRejectedValueOnce(new Error("boom"));
    Object.assign(navigator, { canShare: () => true, share });
    render(<Drip />);
    await screen.findByText("Total balance");
    tab("Backup");
    type(screen.getByLabelText("Export recovery code"), code);
    click("Export backup");
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Export backup" })).toBeEnabled());
    expect(screen.queryByText("Backup failed. Please try again.")).toBeNull();
    click("Export backup");
    expect(await screen.findByText("Backup failed. Please try again.", {}, { timeout: 10_000 })).toBeInTheDocument();
    delete (navigator as any).canShare; delete (navigator as any).share;
  });

  it("restore rejects invalid backup contents", async () => {
    const code = await seed({});
    const bad = await C.encryptBackup({ version: 9 }, code, 100_000);
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Backup");
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [new File([JSON.stringify(bad)], "b.json")] } });
    type(screen.getByLabelText("Restore recovery code"), code);
    click("Restore");
    expect(await screen.findByText("The backup's contents aren't valid.")).toBeInTheDocument();
  });
});

describe("banners", () => {
  it("iOS install hint, persistence warning and dismissals", async () => {
    await seed({});
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    Object.defineProperty(navigator, "storage", { configurable: true, value: { persisted: async () => false, persist: async () => false } });
    render(<Drip />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(await screen.findByText(/may clear Drip's data/)).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "✕" })) fireEvent.click(b);
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
    expect(await screen.findByText(/Install Drip on this device/)).toBeInTheDocument();
    click("Install");
    expect(prompt).toHaveBeenCalled();
    expect(screen.getByText(/over 2 weeks since your last backup/)).toBeInTheDocument();
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
    tab("Backup");
    expect(screen.getByText(/screen lock only/)).toBeInTheDocument();
    expect(screen.getByTestId("settings-tag")).toHaveTextContent("devo");
    expect(screen.getByText(/If this name is taken when sync launches/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on app lock" })).toBeEnabled());
    click("Turn on app lock");
    expect(await screen.findByText("App lock is on.")).toBeInTheDocument();
    expect((create.mock.calls[0] as any)[0].publicKey.user.name).toBe("devo");
    expect((await loadData()).lock?.credentialId).toBe(credId);
    click("Turn off app lock");
    expect(await screen.findByText("App lock is off.")).toBeInTheDocument();
  });
  it("reports failure to create a passkey, and unsupported devices", async () => {
    await seed({});
    vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: async () => null, get: vi.fn() } });
    const { unmount } = render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Backup");
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on app lock" })).toBeEnabled());
    click("Turn on app lock");
    expect(await screen.findByText("Couldn't set up the passkey.")).toBeInTheDocument();
    unmount();
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<Drip />);
    await screen.findByText(/No accounts yet/);
    tab("Backup");
    expect(await screen.findByText(/doesn't support a passkey lock/)).toBeInTheDocument();
  });
  it("locks on open, unlocks by passkey or recovery code, and relocks after 5 minutes hidden", async () => {
    const code = await seed({ lock: { credentialId: credId, enabledAt: "x" } });
    const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ rawId: raw });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: vi.fn(), get } });
    render(<Drip />);
    expect(await screen.findByRole("heading", { name: /locked/ })).toBeInTheDocument();
    expect(await screen.findByText(/Face ID didn't work/)).toBeInTheDocument();
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
