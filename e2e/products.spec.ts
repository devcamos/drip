import { legacyAccount } from "./legacy-account-helpers";
import { test, expect, type Page } from "@playwright/test";
import { unlock, showCloudRecovery } from "./vault-helpers";
import { withAuthRetry } from "./auth-helpers";
import { mkdir } from "node:fs/promises";

async function createCashAccount(page: Page, category = "cash-isa", provider = "MoneyFarm") {
  const code = await legacyAccount(page, "producttest");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Product category", { exact: true }).selectOption(category);
  await page.getByLabel("Provider", { exact: true }).selectOption(provider);
  await page.getByLabel("Balance", { exact: true }).fill("3000");
  await page.getByLabel("Rate", { exact: true }).fill("4");
  await page.getByLabel("Paid", { exact: true }).selectOption("daily");
  await page.getByLabel("Track a pending bonus").check();
  await page.getByLabel("Pending bonus amount £").fill("15.44");
  await page.getByLabel("Expected bonus payment date").fill("2030-05-06");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".bal")).toHaveText("£3,000.00");
  await page.getByLabel("Income amount", { exact: true }).fill("22.65");
  await page.getByRole("button", { name: "Record income", exact: true }).click();
  await expect(page.getByText("Income recorded. Update your balance separately if needed.")).toBeVisible();
  await expect(page.getByTestId("income-history")).toContainText("£22.65");
  return code;
}

for (const product of [
  { category: "cash-isa", provider: "MoneyFarm", label: "Cash ISA" },
  { category: "cash-lisa", provider: "Moneybox", label: "Cash Lifetime ISA (LISA)" },
]) {
test(`${product.label}: income and bonus predictions survive reload and encrypted backup restore`, async ({ page, browser }) => {
  const code = await createCashAccount(page, product.category, product.provider);
  await expect(page.getByText(product.label, { exact: true })).toBeVisible();
  await expect(page.locator(".bal")).toHaveText("£3,000.00");
  if (product.provider === "Moneybox" && process.env.DRIP_UI_CAPTURE) {
    await mkdir("docs/screenshots/moneybox-lisa", { recursive: true });
    for (const [device, width] of [["mobile", 390], ["desktop", 1280]] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `docs/screenshots/moneybox-lisa/${device}.png`, fullPage: true, scale: "css" });
    }
  }
  await page.getByRole("button", { name: "Update balance", exact: true }).click();
  await page.getByLabel("amount", { exact: true }).fill("3200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("form", { name: "Update balance", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("income-history")).toContainText("£22.65");
  await page.reload(); await unlock(page, code);
  await page.getByRole("button", { name: product.provider }).click();
  await expect(page.locator(".bal")).toHaveText("£3,200.00");
  await expect(page.getByText("Pending bonus · £15.44")).toBeVisible();
  await expect(page.getByTestId("income-history")).toContainText("£22.65");
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
    await restored.getByRole("button", { name: product.provider }).click();
    await expect(restored.locator(".bal")).toHaveText("£3,200.00");
    await expect(restored.getByText(product.label, { exact: true })).toBeVisible();
    await expect(restored.getByText("Pending bonus · £15.44")).toBeVisible();
    await expect(restored.getByTestId("income-history")).toContainText("£22.65");
    await restored.getByLabel("Payment type").selectOption("bonus");
    await restored.getByLabel("Income amount", { exact: true }).fill("15.44");
    await restored.getByRole("button", { name: "Record income", exact: true }).click();
    await expect(restored.getByText("Pending bonus · £15.44")).toHaveCount(0);
    await expect(restored.locator(".bal")).toHaveText("£3,200.00");
    await expect(restored.getByTestId("income-history")).toContainText("£38.09");
    await restored.getByRole("navigation").getByRole("button", { name: "Trends", exact: true }).click();
    await expect(restored.getByRole("region", { name: "Recorded income summary" })).toContainText("£38.09");
  } finally { await fresh.close(); }
});
}

test("product and recorded income survive fresh-device encrypted cloud recovery", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database; no Production credentials in CI.");
  const code = await createCashAccount(page);
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), page.getByText("Encrypted cloud copy saved.").first());
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage(); await restored.goto("http://localhost:4321");
    await showCloudRecovery(restored);
    await restored.getByLabel("Recovery code", { exact: true }).fill(code);
    await withAuthRetry(restored, () => restored.getByRole("button", { name: "Restore cloud accounts", exact: true }).click(), restored.getByRole("button", { name: /MoneyFarm/ }));
    await restored.getByRole("button", { name: /MoneyFarm/ }).click();
    await expect(restored.getByText("Cash ISA", { exact: true })).toBeVisible();
    await expect(restored.locator(".bal")).toHaveText("£3,000.00");
    await expect(restored.getByText("Pending bonus · £15.44")).toBeVisible();
    await expect(restored.getByTestId("income-history")).toContainText("£22.65");
  } finally { await fresh.close(); }
});
