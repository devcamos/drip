import { expect, type Page, type Locator } from "@playwright/test";

// These journeys share a host/IP. Respect real server Retry-After when several
// independent test users sign in quickly; never disable production auth limits.
export async function withAuthRetry(page: Page, action: () => Promise<void>, success: Locator) {
  let retryMs = 10_100;
  const observe = (response: import("@playwright/test").Response) => {
    if (response.status() === 429 && response.url().includes("/api/auth/")) retryMs = (Number(response.headers()["retry-after"]) || 10) * 1000 + 100;
  };
  page.on("response", observe);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await action();
      await expect.poll(async () => await success.isVisible() ? "saved" : await page.getByText(/Too many sign-in attempts/).isVisible() ? "limited" : "pending", { timeout: 30_000 }).not.toBe("pending");
      if (await success.isVisible()) return;
      await page.waitForTimeout(retryMs);
    }
    await expect(success).toBeVisible();
  } finally { page.off("response", observe); }
}

