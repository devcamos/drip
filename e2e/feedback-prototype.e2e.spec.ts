import { expect, test } from "@playwright/test";

test("a user previews feedback without changing accounts, then explores its proposed C4 delivery design", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  await page.goto("/prototype/welcome");
  await page.getByRole("button", { name: "Enter demo", exact: true }).click();
  await page.getByRole("button", { name: "Give feedback", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Give feedback" });
  await dialog.getByLabel("What happened?", { exact: true }).fill("The account card did not open when tapped.");
  await dialog.getByLabel("Which part of Drip?").selectOption("accounts");
  await dialog.getByRole("button", { name: "Review message" }).click();
  await expect(dialog.getByLabel("Message preview")).toContainText("The account card did not open");
  await dialog.getByRole("button", { name: "Preview confirmation" }).click();
  await expect(dialog.getByLabel("Sample feedback receipt")).toContainText("No message has been saved or sent");
  await dialog.getByRole("button", { name: "Close feedback" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Give feedback", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Money overview" })).toContainText("£7,500.00");
  await expect(page.getByRole("region", { name: "Estimated income" })).toContainText("£28.33");
  await page.getByRole("link", { name: "Feedback design", exact: true }).click();
  await expect(page.getByLabel("C4 context diagram")).toBeVisible();
  await page.getByRole("button", { name: "C4 containers" }).click();
  await expect(page.getByLabel("C4 container diagram")).toContainText("Feedback store");
  await page.getByRole("button", { name: "Notion unavailable" }).click();
  await expect(page.getByRole("heading", { name: "Saved, waiting for delivery." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
});
