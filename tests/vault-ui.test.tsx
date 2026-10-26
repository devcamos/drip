// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Drip from "../app/Drip";
import { emptyData, lockLocalVault, loadData } from "../lib/db";
import { codeVerifier } from "../lib/crypto";
import { seedVault, rawStore, fixtureCode } from "./storage-fixtures";
const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "private_user", createdAt: "now" } };
const fill = (code: string) => fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: code } });
describe("local vault gate", () => {
  it("gates legacy records until code verification and verified encryption succeed", async () => {
    await rawStore({ data, verifier: await codeVerifier(fixtureCode) });
    render(<Drip />); await screen.findByRole("heading", { name: "Encrypt this device" });
    expect(screen.queryByTestId("header-tag")).toBeNull(); expect(screen.queryByRole("navigation")).toBeNull();
    fill("wrong"); fireEvent.click(screen.getByRole("button", { name: "Encrypt local data" }));
    await screen.findByText("That isn't your recovery code."); expect((await rawStore()).data).toEqual(data);
    fill(fixtureCode); fireEvent.click(screen.getByRole("button", { name: "Encrypt local data" }));
    await screen.findByTestId("header-tag"); expect((await rawStore()).data.app).toBe("drip-local-data");
  });
  it("does not render decrypted accounts on a fresh page until unlocked", async () => {
    await seedVault(data); lockLocalVault(); render(<Drip />);
    await screen.findByRole("heading", { name: "Sign in to Drip" });
    expect(screen.queryByText("private_user")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fill(fixtureCode); fireEvent.click(screen.getByRole("button", { name: "Recover account" }));
    await screen.findByTestId("header-tag"); expect(await loadData()).toEqual(data);
  });
  it("keeps encryption failures visible on the migration gate and preserves original data", async () => {
    await rawStore({ data, verifier: await codeVerifier(fixtureCode) }); render(<Drip />);
    await screen.findByRole("heading", { name: "Encrypt this device" });
    vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(new Error("Device encryption unavailable"));
    fill(fixtureCode); fireEvent.click(screen.getByRole("button", { name: "Encrypt local data" }));
    await screen.findByText("Device encryption unavailable");
    expect((await rawStore()).data).toEqual(data); expect(screen.queryByTestId("header-tag")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Encrypt local data" })).toBeEnabled());
  });
});
