import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const stage of ["sign-in", "sign-up"] as const) {
  for (const status of [403, 429, 503]) {
    test(`signup handles ${stage} ${status} without asking for a recovery code`, async ({ page }) => {
      let registrations = 0;
      await page.route("**/api/auth/sign-in/email", route => route.fulfill({
        status: stage === "sign-up" ? 401 : status, contentType: "application/json",
        body: JSON.stringify(stage === "sign-up" ? { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } : { message: "PRIVATE_SERVER_DETAIL" }),
      }));
      await page.route("**/api/auth/sign-up/email", route => {
        registrations++;
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message: "PRIVATE_SERVER_DETAIL" }) });
      });
      await page.goto("/#signup");
      await page.getByLabel(/^Gamertag/).fill("signup_demo");
      await page.getByLabel("Create password", { exact: true }).fill("Synthetic signup meadow 42!");
      await page.getByLabel("Confirm new account password", { exact: true }).fill("Synthetic signup meadow 42!");
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      const alert = page.getByRole("form", { name: "Sign up", exact: true }).getByRole("alert");
      await expect(alert).toHaveText(status === 429
        ? "Too many sign-in attempts. Wait a minute, then try again."
        : status === 503 ? "Could not create your account because Drip's sign-in service is unavailable. Try again shortly."
        : "Could not create your account. Refresh the app and try again.");
      await expect(alert).not.toContainText(/recovery code|PRIVATE_SERVER_DETAIL/);
      expect(registrations).toBe(stage === "sign-up" ? 1 : 0);
      await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
      await expect(page.getByRole("region", { name: "Account cards" })).toHaveCount(0);
      if (process.env.DRIP_SIGNUP_CAPTURE && stage === "sign-in" && status === 503) {
        const dir = "docs/screenshots/signup-errors";
        await mkdir(dir, { recursive: true });
        for (const [device, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
          await page.setViewportSize({ width, height });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: `${dir}/service-unavailable-${device}.png`, fullPage: true,
            style: 'input[type="password"] { color:transparent !important; text-shadow:none !important; caret-color:transparent !important; }' });
        }
      }
    });
  }
}
