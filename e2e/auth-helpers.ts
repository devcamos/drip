import { expect, test, type Page, type Locator } from "@playwright/test";
import { Pool } from "pg";
import { localTestDatabase } from "../server/local-test-database";

let limits: Pool | undefined;
test.beforeEach(async () => {
  if (process.env.DRIP_CLOUD_E2E !== "1") return;
  const connectionString = localTestDatabase(process.env);
  if (!connectionString) throw new Error("Cloud browser cases need the isolated local fixture.");
  limits ??= new Pool({ connectionString });
  // Independent test users share a loopback IP. Reset limiter state between
  // scenarios, retaining the actual limiter and its assertions within each one.
  await limits.query('TRUNCATE "rateLimit", drip_recovery_limits');
});
test.afterAll(async () => { await limits?.end(); limits = undefined; });

export async function expectCloudSessionEnded(page: Page) {
  // The login screen appears as soon as local keys are dropped. Remote signout
  // completes separately; observe its real persisted acknowledgement first.
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("drip"); request.onsuccess = () => resolve(request.result); });
    return new Promise<boolean>(resolve => {
      const tx = db.transaction("kv"), request = tx.objectStore("kv").get("deviceSession");
      tx.oncomplete = () => { db.close(); resolve(request.result?.signedOut === true && request.result.remotePending === false); };
    });
  }), { timeout: 15_000 }).toBe(true);
  let response = await page.request.get("/api/auth/get-session");
  if (response.status() === 429) {
    // A long, multi-device journey can consume the shared-IP read budget. Do
    // not poll it repeatedly or mistake a throttled response for a session.
    const seconds = Number(response.headers()["retry-after"] ?? response.headers()["x-retry-after"]);
    expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(60);
    await page.waitForTimeout(seconds * 1000 + 100);
    response = await page.request.get("/api/auth/get-session");
  }
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
}

export async function finishSignupRecovery(page: Page) {
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible({ timeout: 30_000 });
  const panel = page.getByRole("region", { name: "Recovery codes", exact: true });
  await expect(panel.getByLabel("Confirm your password", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Download recovery codes" })).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download recovery codes" }).click();
  expect((await download).suggestedFilename()).toBe("drip-recovery-codes.txt");
  await panel.getByRole("checkbox", { name: /I’ve saved a screenshot/ }).check();
  await panel.getByRole("button", { name: "Continue to Accounts" }).click();
  await expect(page.getByTestId("header-tag")).toBeVisible();
}

export async function enableCloudRecovery(page: Page) {
  const panel = page.getByRole("region", { name: "Cloud recovery", exact: true });
  const enable = panel.getByRole("button", { name: "Enable encrypted cloud recovery" });
  // Connecting can succeed before a throttled first sync. Retry the existing
  // connection rather than looking for a signup button which has disappeared.
  await withAuthRetry(page, async () => {
    if (await enable.isVisible()) await enable.click();
    else await panel.getByRole("button", { name: "Sync now", exact: true }).click();
  }, page.getByText(/^(Encrypted cloud copy saved\.|Cloud copy is up to date\.)$/).first());
}

// These journeys share a host/IP. Respect real server Retry-After when several
// independent test users sign in quickly; never disable production auth limits.
export async function withAuthRetry(page: Page, action: () => Promise<void>, success: Locator) {
  let retryMs = 10_100;
  let limited = false;
  const observe = (response: import("@playwright/test").Response) => {
    if (response.status() === 429 && response.url().includes("/api/auth/")) {
      limited = true;
      retryMs = (Number(response.headers()["retry-after"] ?? response.headers()["x-retry-after"]) || 10) * 1000 + 100;
    }
  };
  page.on("response", observe);
  async function attempt(remaining: number): Promise<void> {
    limited = false; await action();
    await expect.poll(async () => {
      if (await success.isVisible()) return "saved";
      if (limited || await page.getByText(/Too many sign-in attempts/).first().isVisible()) return "limited";
      return "pending";
    }, { timeout: 30_000 }).not.toBe("pending");
    if (await success.isVisible()) return;
    // The server's Retry-After is a real time boundary, not a UI readiness wait.
    await page.waitForTimeout(retryMs);
    if (remaining > 1) return attempt(remaining - 1);
    await expect(success).toBeVisible();
  }
  try {
    await attempt(3);
  } finally { page.off("response", observe); }
}

