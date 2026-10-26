import { expect, type Page, type Locator } from "@playwright/test";

export async function finishSignupRecovery(page: Page, password: string) {
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible({ timeout: 30_000 });
  const panel = page.getByRole("region", { name: "Recovery codes", exact: true });
  await panel.getByLabel("Confirm your password", { exact: true }).fill(password);
  await withAuthRetry(page, () => panel.getByRole("button", { name: "Open original recovery codes" }).click(), panel.getByRole("button", { name: "Download recovery codes" }));
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download recovery codes" }).click();
  expect((await download).suggestedFilename()).toBe("drip-recovery-codes.txt");
  await panel.getByRole("button", { name: "I’ve saved my recovery codes" }).click();
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

