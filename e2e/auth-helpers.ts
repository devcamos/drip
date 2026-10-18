import { expect, type Page, type Locator } from "@playwright/test";

// These journeys share a host/IP. Respect real server Retry-After when several
// independent test users sign in quickly; never disable production auth limits.
export async function withAuthRetry(page: Page, action: () => Promise<void>, success: Locator) {
  let retryMs = 10_100;
  const observe = (response: import("@playwright/test").Response) => {
    if (response.status() === 429 && response.url().includes("/api/auth/")) retryMs = (Number(response.headers()["retry-after"]) || 10) * 1000 + 100;
  };
  page.on("response", observe);
  async function attempt(remaining: number): Promise<void> {
    await action();
    await expect.poll(async () => {
      if (await success.isVisible()) return "saved";
      if (await page.getByText(/Too many sign-in attempts/).isVisible()) return "limited";
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

