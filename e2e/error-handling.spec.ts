import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("sign-in outages show a traceable safe message and keep sensitive payloads out of diagnostics", async ({ page }) => {
  const reference = "11111111-1111-4111-8111-111111111111";
  const records: string[] = [];
  page.on("console", message => { if (message.text().startsWith('{"app":"drip"')) records.push(message.text()); });
  await page.route("**/api/auth/sign-in/gamertag-key", route => route.fulfill({ status: 503,
    headers: { "Content-Type": "application/json", "X-Drip-Request-Id": reference },
    body: JSON.stringify({ code: "AUTH_UNAVAILABLE", message: "private SQL should never appear", requestId: reference }) }));
  await page.goto("/#login");
  await page.getByLabel("Gamertag", { exact: true }).fill("synthetic_diag");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-only-password-42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const alert = page.getByRole("form", { name: "Password sign-in", exact: true }).getByRole("alert");
  await expect(alert).toContainText(`Could not complete sign-in. Try again shortly. Reference: ${reference}`);
  await expect(alert).not.toContainText("private SQL");
  expect(records.some(record => JSON.parse(record).requestId === reference)).toBe(true);
  expect(records.join("\n")).not.toMatch(/synthetic_diag|Synthetic-only-password|private SQL/);
  await page.getByLabel("Password", { exact: true }).fill("");
  if (process.env.DRIP_CAPTURE_ERRORS === "1") {
    mkdirSync("docs/screenshots/error-handling", { recursive: true });
    await page.screenshot({ path: "docs/screenshots/error-handling/signin-outage-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "docs/screenshots/error-handling/signin-outage-desktop.png", fullPage: true });
  }
});
