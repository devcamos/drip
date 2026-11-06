import { expect, test } from "@playwright/test";

test("entry prototype supports the first-account journey without auth requests or saved account data", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/prototype/welcome");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const picker = page.getByRole("group", { name: "Preview screen" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Sign in", "No accounts yet", "Your accounts"]) {
      const control = picker.getByRole("button", { name, exact: true });
      await control.click();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.getByRole("button", { name: "No accounts yet", exact: true }).click();
  const add = page.getByRole("button", { name: /Add an account/ });
  await add.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await page.getByRole("button", { name: /Stocks & funds/ }).click();
  const stock = page.getByRole("button", { name: /Realty Income.*£2,500/ });
  await expect(stock).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Average price", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yearly", exact: true }).click();
  expect((await page.getByRole("button", { name: "Yearly", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£340.00");
  await page.getByText("Make yourself at home", { exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByText("Install reminder hidden in this preview.")).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("button", { name: "Enter demo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£28.33");
  await expect(stock).toHaveAttribute("aria-expanded", "false");
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(async () => ({ databases: await indexedDB.databases(), localKeys: Object.keys(localStorage) }))).toEqual({ databases: [], localKeys: [] });
});
