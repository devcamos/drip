import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock, showCloudRecovery } from "./vault-helpers";

async function capture(page: Page, state: string) {
  if (!process.env.DRIP_ACCOUNT_OPTIONS_CAPTURE) return;
  await mkdir("docs/screenshots/account-options", { recursive: true });
  for (const [device, width] of [["mobile", 390], ["desktop", 1280]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (state === "accounts") await page.locator(".stack").evaluate(el => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `docs/screenshots/account-options/${state}-${device}.png`, scale: "css" });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}

test("colours, Lloyds and stock identities survive edits, reload and encrypted file recovery", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const code = await legacyAccount(page, "portfolio_demo");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("Lloyds Bank");
  await expect(page.getByLabel("Product category", { exact: true })).toHaveValue("easy-access");
  await page.getByLabel("Balance", { exact: true }).fill("2500");
  await page.getByLabel("Rate", { exact: true }).fill("3.25");
  await page.getByLabel("Custom account colour", { exact: true }).fill("#ffffff");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".bal")).toHaveText("£2,500.00");
  await expect(page.locator(".card")).toHaveCSS("color", "rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Nickname", { exact: true }).fill("Rainy day");
  await expect(page.getByLabel("Custom account colour", { exact: true })).toHaveValue("#ffffff");
  await capture(page, "lloyds-edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit account" })).toHaveCount(0);
  await page.reload(); await unlock(page, code);
  await page.getByRole("button", { name: /Lloyds Bank/ }).click();
  await expect(page.locator(".card")).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.getByText("Rainy day", { exact: true })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Product category", { exact: true }).selectOption("stocks-funds");
  await page.getByLabel("Provider", { exact: true }).selectOption("Trading212");
  const picker = page.getByLabel("Stock / fund", { exact: true });
  for (const holding of ["Realty Income", "Digital Realty", "Prologis", "American Tower", "Brookfield Infrastructure", "Air Products and Chemicals"]) {
    await expect(picker.getByRole("option", { name: holding, exact: true })).toHaveCount(1);
  }
  await expect(page.getByLabel("Rate", { exact: true })).toHaveValue("");
  await picker.selectOption("Realty Income");
  await page.getByLabel("Balance", { exact: true }).fill("1200");
  await page.getByLabel("Rate", { exact: true }).fill("5.75");
  await page.getByLabel("Paid", { exact: true }).selectOption("monthly");
  await page.getByRole("button", { name: "Plum account colour" }).click();
  await capture(page, "stock-form");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".holding")).toHaveText("Realty Income");
  await expect(page.locator(".bal")).toHaveText("£1,200.00");
  await expect(page.getByRole("region", { name: "Income predictions", exact: true }).getByText("5.75%", { exact: true })).toBeVisible();
  await capture(page, "stock-detail");

  await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Product category", { exact: true }).selectOption("stocks-funds");
  await page.getByLabel("Provider", { exact: true }).selectOption("Trading212");
  await page.getByLabel("Stock / fund", { exact: true }).selectOption("custom");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Stock / fund name", { exact: true }).fill("Custom investment trust");
  await page.getByLabel("Balance", { exact: true }).fill("750");
  await page.getByLabel("Rate", { exact: true }).fill("4.25");
  await page.getByLabel("Paid", { exact: true }).selectOption("quarterly");
  await page.getByRole("button", { name: "Ocean account colour" }).click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await capture(page, "custom-stock-form");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".holding")).toHaveText("Custom investment trust");
  await page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true }).click();
  await capture(page, "accounts");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Advanced: file backups & app lock").click();
  await page.getByLabel("Export recovery code", { exact: true }).fill(code);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const backup = await downloaded;
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage(); await restored.goto("http://localhost:4321");
    await showCloudRecovery(restored);
    await restored.getByRole("button", { name: "Restore a backup", exact: true }).click();
    await restored.getByLabel("Backup file", { exact: true }).setInputFiles((await backup.path())!);
    await restored.getByLabel("Restore recovery code", { exact: true }).fill(code);
    await restored.getByRole("button", { name: "Restore", exact: true }).click();
    await restored.getByRole("button", { name: /Realty Income/ }).click();
    await expect(restored.locator(".holding")).toHaveText("Realty Income");
    await expect(restored.getByRole("region", { name: "Income predictions", exact: true }).getByText("5.75%", { exact: true })).toBeVisible();
    await restored.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(restored.getByLabel("Custom account colour", { exact: true })).toHaveValue("#6b2d83");
    await expect(restored.getByLabel("Paid", { exact: true })).toHaveValue("monthly");
    await restored.getByRole("button", { name: "Cancel", exact: true }).click();
    await restored.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true }).click();
    await restored.getByRole("button", { name: /Custom investment trust/ }).click();
    await expect(restored.getByRole("region", { name: "Income predictions", exact: true }).getByText("4.25%", { exact: true })).toBeVisible();
    await restored.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(restored.getByLabel("Stock / fund name", { exact: true })).toHaveValue("Custom investment trust");
    await expect(restored.getByLabel("Custom account colour", { exact: true })).toHaveValue("#176b9a");
    await expect(restored.getByLabel("Paid", { exact: true })).toHaveValue("quarterly");
    await restored.getByRole("button", { name: "Cancel", exact: true }).click();
    await restored.reload(); await unlock(restored, code);
    await restored.getByRole("button", { name: /Lloyds Bank/ }).click();
    await expect(restored.getByText("Easy-access saver", { exact: true })).toBeVisible();
    await expect(restored.locator(".bal")).toHaveText("£2,500.00");
    await expect(restored.locator(".card")).toHaveCSS("color", "rgb(0, 0, 0)");
  } finally { await fresh.close(); }
});
