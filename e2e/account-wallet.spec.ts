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
    expect(await wallet.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    // The following card may cover only the preceding card's empty footer.
    expect(await wallet.locator(".card").evaluateAll(cards => cards.slice(0, -1).every((card, i) => {
      const content = card.lastElementChild!.getBoundingClientRect();
      return cards[i + 1].getBoundingClientRect().top >= content.bottom;
    }))).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await wallet.evaluate(el => { el.scrollTop = 0; });
  await screenshot(page, "mobile-start", 390);
  await screenshot(page, "desktop-start", 1280);
  await page.setViewportSize({ width: 390, height: 1000 });
  // Check keyboard browsing separately from touch momentum.
  await wallet.focus();
  for (const _ of accounts) await page.keyboard.press("Tab");
  const last = wallet.getByRole("button", { name: /Air Products and Chemicals/ });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: 1 });
  await screenshot(page, "mobile-end", 390);
  await screenshot(page, "desktop-end", 1280);
  await page.setViewportSize({ width: 390, height: 1000 });
  await wallet.evaluate(el => { el.scrollTop = 0; });
  await wallet.hover();
  await page.mouse.wheel(0, 380);
  await expect.poll(() => wallet.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await wallet.evaluate(el => { el.scrollTop = 0; });
  const bounds = (await wallet.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height - 30;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 35 }] });
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => wallet.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await touch.detach();
  await last.tap();
  await expect(page.locator(".holding")).toHaveText("Air Products and Chemicals");
  await expect(page.locator(".bal")).toHaveText("£2,750.00");
  await page.getByRole("button", { name: "← Accounts", exact: true }).click();
  const first = page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", { name: /Zopa/ });
  await first.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".prov")).toHaveText("Zopa");
  await expect(page.locator(".bal")).toHaveText("£1,000.00");
});
