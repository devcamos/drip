import { expect, test } from "@playwright/test";

test("a user explores a credit card from an empty account list and edits its statement figures", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/prototype/welcome");
  await page.getByRole("group", { name: "Preview screen" }).getByRole("button", { name: "No accounts yet", exact: true }).click();
  await expect(page.getByText("Your account list is empty.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add an account", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Credit card/ }).click();
  const credit = page.getByRole("button", { name: /Barclaycard.*owed/ });
  await expect(credit).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Edit credit card", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit credit card" });
  await editor.getByLabel("Amount owed (£)", { exact: true }).fill("1500");
  await editor.getByLabel("APR (%)", { exact: true }).fill("0");
  await editor.getByLabel("Statement minimum payment (£)", { exact: true }).fill("50");
  await editor.getByLabel("Planned payment (£, optional)", { exact: true }).fill("100");
  await editor.getByLabel("Payment due date", { exact: true }).fill("2026-11-25");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£6,000.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£28.33");
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("25 Nov 2026");
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(async () => ({ databases: await indexedDB.databases(), localKeys: Object.keys(localStorage) }))).toEqual({ databases: [], localKeys: [] });
});

test("a returning user can plan a repayment, dismiss the editor with a keyboard and reset the sample at phone and desktop sizes", async ({ page }) => {
  await page.goto("/prototype/welcome");
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  const credit = page.getByRole("button", { name: /Barclaycard.*owed/ });
  await credit.click();
  const edit = page.getByRole("button", { name: "Edit credit card", exact: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await edit.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeInViewport({ ratio: 1 });
    const dueDate = page.getByLabel("Payment due date", { exact: true });
    // The native mobile date picker handles its own first Escape. The other
    // journey fills the date; here verify its hit target after scrolling, then
    // exercise the editor's keyboard dismissal without opening browser chrome.
    await dueDate.evaluate(input => input.scrollIntoView({ block: "center" }));
    await expect(dueDate).toBeInViewport({ ratio: 1 });
    expect(await dueDate.evaluate(input => {
      const box = input.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === input;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(edit).toBeFocused();
  }
  await edit.click();
  await page.getByLabel("Planned payment (£, optional)", { exact: true }).fill("20");
  await expect(page.getByRole("list", { name: "Credit card notes" })).toContainText("below the statement minimum");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£6,300.00");
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£20.00");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Credit card payment plan" })).toContainText("£75.00");
  await expect(credit).toHaveAttribute("aria-expanded", "false");
});
