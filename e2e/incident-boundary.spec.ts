import { expect, test } from "@playwright/test";

test("expected API validation stays quiet and the sign-in screen remains available", async ({ page }) => {
  const invalid = await page.request.get("/api/exchange-rates?base=GBP");
  expect(invalid.status()).toBe(400);
  expect(invalid.headers()["x-drip-incident-reference"]).toBeUndefined();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});
