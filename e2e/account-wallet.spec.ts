import { showAccountDetails } from "./saved-navigation";
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { legacyAccount } from "./legacy-account-helpers";
import type { Account } from "../lib/types";

const names = ["Zopa", "Lloyds Bank", "Realty Income", "Digital Realty", "Prologis", "American Tower", "Brookfield Infrastructure", "Air Products and Chemicals"];
const colours = ["#2b2d86", "#006a4d", "#6b2d83", "#176b9a", "#b85a2a", "#4a5070", "#ffeedd", "#0f6669"];
const accounts: Account[] = names.map((name, i) => ({
  id: `wallet-${i}`, provider: i < 2 ? name : "Trading212", holdingName: i < 2 ? undefined : name,
  productCategory: i < 2 ? "easy-access" : "stocks-funds", label: "", balance: 1000 + i * 250,
  ratePct: 4, rateType: i < 2 ? "interest" : "dividend", frequency: "monthly",
  nextPayoutDate: "2027-01-01", colour: colours[i], payouts: [], events: [], createdAt: "2026-10-01",
}));

async function screenshot(page: Page, state: string, width: number) {
  if (!process.env.DRIP_WALLET_CAPTURE) return;
  await mkdir("docs/screenshots/account-wallet", { recursive: true });
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `docs/screenshots/account-wallet/${state}.png`, scale: "css" });
}

test("overlapping account wallet scrolls to every card without obscuring its content", async ({ page }) => {
  await legacyAccount(page, "wallet_demo", accounts);
  const wallet = page.getByRole("region", { name: "Account cards", exact: true });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await wallet.evaluate(el => getComputedStyle(el).overflowY)).not.toMatch(/auto|scroll/);
    // The following card may cover only the preceding card's empty footer.
    expect(await wallet.locator(".card").evaluateAll(cards => cards.slice(0, -1).every((card, i) => {
      const content = card.lastElementChild!.getBoundingClientRect();
      return cards[i + 1].getBoundingClientRect().top >= content.bottom;
    }))).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, "mobile-start", 390);
  await screenshot(page, "desktop-start", 1280);
  await page.setViewportSize({ width: 390, height: 1000 });
  // Check keyboard browsing separately from touch momentum.
  await wallet.focus();
  // Two group summaries precede their cards in the keyboard order.
  for (let i = 0; i < accounts.length + 2; i++) await page.keyboard.press("Tab");
  const last = wallet.getByRole("button", { name: /Air Products and Chemicals/ });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: 1 });
  await screenshot(page, "mobile-end", 390);
  await screenshot(page, "desktop-end", 1280);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await wallet.locator("summary").first().scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 380);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
  await last.tap();
  await showAccountDetails(page);
  await expect(page.locator(".holding")).toHaveText("Air Products and Chemicals");
  await expect(page.locator(".bal")).toHaveText("£2,750.00");
  await page.getByRole("button", { name: "← Accounts", exact: true }).click();
  const first = page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Zopa/ });
  await first.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".prov")).toHaveText("Zopa");
  await expect(page.locator(".bal")).toHaveText("£1,000.00");
});

test("account groups show their totals and can be collapsed", async ({ page }) => {
  const debt: Account = { ...accounts[0], id: "credit-group", provider: "Barclaycard", productCategory: "credit-card", balance: 600, ratePct: 0, creditCard: { apr: 19.9, minimumPayment: 25 } };
  await legacyAccount(page, "groups_demo", [...accounts, debt]);
  const wallet = page.getByRole("region", { name: "Account cards", exact: true });
  const cash = wallet.locator("details").filter({ hasText: "Cash" });
  const investments = wallet.locator("details").filter({ hasText: "Investments" });
  await expect(cash.locator("summary")).toContainText("£2,250.00");
  await expect(investments.locator("summary")).toContainText("£12,750.00");
  await expect(wallet.locator("details").filter({ hasText: "Debt" }).locator("summary")).toContainText("£600.00 owed");
  await investments.locator("summary").click();
  await expect(investments.getByRole("button", { name: /Open Digital Realty/ })).toBeHidden();
  await investments.locator("summary").click();
  await expect(investments.getByRole("button", { name: /Open Digital Realty/ })).toBeVisible();
  if (process.env.DRIP_GROUP_CAPTURE) {
    const captureDir = process.env.DRIP_GROUP_CAPTURE_DIR || "docs/screenshots/grouped-accounts";
    await mkdir(captureDir, { recursive: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await wallet.locator("summary").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${captureDir}/expanded-390.png`, fullPage: true, scale: "css" });
    while (await wallet.locator("details[open] > summary").count()) await wallet.locator("details[open] > summary").first().click();
    await wallet.evaluate(el => { el.scrollTop = 0; });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${captureDir}/accounts-${width}.png`, fullPage: true, scale: "css" });
    }
  }
});
