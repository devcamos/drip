// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => auth }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import Drip from "../app/Drip";
import { AccountForm } from "../app/AccountForm";
import * as db from "../lib/db";
import { localToday } from "../lib/maths";
import { dataFormatVersion } from "../lib/data-format";
import { cloudKey, seal, unseal } from "../lib/cloud";
import { decryptBackup, encryptBackup } from "../lib/crypto";
import { releaseData, releaseSaver } from "./saved-experience-fixtures";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import * as previousCloud from "./fixtures/pre-workflow-client/cloud";
import type { AppData } from "../lib/types";

it("shows a due task, confirms figures, persists the encrypted review and hides the completed task", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ available: false })));
  await seedVault(releaseData([releaseSaver()])); render(<Drip />);
  const task = await screen.findByRole("region", { name: "Review your figures" });
  expect(task).toHaveTextContent("Balance · Interest rate · Expected payment date");
  fireEvent.click(screen.getByRole("button", { name: "Review Zopa" }));
  const detail = await screen.findByRole("region", { name: "Review your figures" });
  expect(detail).toHaveTextContent("Not confirmed yet");
  fireEvent.click(screen.getByRole("button", { name: "I’ve checked these figures" }));
  await screen.findByText("Review saved securely.");
  const saved = (await db.loadData()).accounts[0]; const today = localToday();
  expect(saved).toMatchObject({ balanceReviewedAt: today, rateReviewedAt: today, paymentDateReviewedAt: today });
  expect(dataFormatVersion(await db.loadData())).toBe(6);
  expect(JSON.stringify(await rawStore())).not.toContain("balanceReviewedAt");
  const savedData = await db.loadData(), key = await cloudKey(fixtureCode);
  const envelope = await seal(savedData, key);
  expect(envelope.v).toBe(6);
  expect((await unseal(envelope, key)).accounts[0].balanceReviewedAt).toBe(today);
  await expect(previousCloud.unseal(envelope as never, key)).rejects.toThrow("Unsupported cloud copy");
  const backup = await encryptBackup(savedData, fixtureCode, 100_000);
  expect(backup.v).toBe(6);
  expect((await decryptBackup<AppData>(backup, fixtureCode)).accounts[0].rateReviewedAt).toBe(today);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Accounts" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Review your figures" })).not.toBeInTheDocument());
});

it("refreshes only the figure review date changed in the account editor", async () => {
  const today = localToday(); const oldReview = "2026-10-01"; let saved = releaseSaver({ balanceReviewedAt: oldReview, rateReviewedAt: oldReview, paymentDateReviewedAt: oldReview });
  render(<AccountForm existing={saved} onCancel={() => {}} onSave={async account => { saved = account; return true; }} />);
  fireEvent.change(screen.getByLabelText("Balance"), { target: { value: "5200" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved.balance).toBe(5200));
  expect(saved.balanceReviewedAt).toBe(today);
  expect(saved.rateReviewedAt).toBe(oldReview);
  expect(saved.paymentDateReviewedAt).toBe(oldReview);
});
