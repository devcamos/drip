import { expect, test } from "@playwright/test";
import { legacyAccount } from "./legacy-account-helpers";
import { releaseSaver } from "../tests/saved-experience-fixtures";
import { mkdir } from "node:fs/promises";

test("a signed-in user can send a clearly disclosed feedback message and receive a reference", async ({ page }) => {
  await legacyAccount(page, "feedback_demo", [releaseSaver()]);
  // Synthetic cloud metadata and intercepted transport: database persistence is verified separately by real Postgres tests.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put({ userId: "synthetic", identityId: "synthetic", version: 1, dirty: false, generation: "test", revision: 0, lastSyncAt: null }, "cloudState"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); });
  });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/api/feedback", async route => { sent = route.request().postDataJSON(); await route.fulfill({ json: { saved: true, reference: sent!.id } }); });
  await page.getByRole("button", { name: /Open profile and settings/ }).click();
  await page.getByRole("button", { name: /Give feedback/ }).click();
  await expect(page.getByText(/authorised agents can read/)).toBeVisible();
  await page.getByLabel("Which area?").selectOption("portfolio");
  await page.getByLabel("Your feedback").fill("Show a clearer income breakdown.");
  if (process.env.DRIP_FEEDBACK_CAPTURE) {
    await mkdir("docs/screenshots/feedback-inbox", { recursive: true });
    for (const width of [390, 1280]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: `docs/screenshots/feedback-inbox/write-${width}.png`, fullPage: true, scale: "css" }); }
  }
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Your message was saved for the Drip team to review.")).toBeVisible();
  expect(sent).toMatchObject({ category: "improvement", area: "portfolio", message: "Show a clearer income breakdown." });
  expect(Object.keys(sent!).sort()).toEqual(["area", "category", "id", "message"]);
});
