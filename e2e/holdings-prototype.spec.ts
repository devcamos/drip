import { expect, test } from "@playwright/test";
import path from "node:path";

for (const [label, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]] as const) {
  test(`holdings prototype: ${label} stack, expansion, edits and gradient choices`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    const apiRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
    await page.goto("/prototype");
    await page.evaluate(() => document.fonts.ready);
    const capture = async (state: string) => {
      await page.screenshot({ path: path.join("docs/screenshots/holdings-prototype", `${label}-${state}.png`), fullPage: state === "stack" || (label === "desktop" && state === "expanded"), animations: "disabled", scale: "css" });
    };
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: "Your accounts." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Stacked account cards" }).getByRole("button")).toHaveCount(4);
    await noOverflow();
    await capture("stack");

    const realty = page.getByRole("button", { name: "Realty Income, £3,680.00", exact: true });
    await realty.click();
    await expect(realty).toHaveAttribute("aria-expanded", "true");
    const card = page.locator("article").filter({ has: page.getByRole("button", { name: /^Realty Income,/ }) });
    for (const text of ["Average price", "Shares", "Holding value", "Dividend yield", "£43.20", "5.60%"]) await expect(card.getByText(text, { exact: true })).toBeVisible();
    if (label === "mobile") await page.getByRole("heading", { name: "Your stack 4", exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }));
    else await page.evaluate(() => scrollTo(0, 0));
    await noOverflow();
    await capture("expanded");

    const colourButton = card.getByRole("button", { name: "Change colour for Realty Income" });
    await colourButton.click();
    const dialog = page.getByRole("dialog", { name: "Make it yours" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Forest", exact: true }).click();
    await expect(dialog.getByText("Forest gradient")).toBeVisible();
    await noOverflow();
    await capture("gradients");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveAttribute("data-gradient", "Copper");
    await expect(colourButton).toBeFocused();
    await colourButton.click();
    await dialog.getByRole("button", { name: "Forest", exact: true }).click();
    await dialog.getByRole("button", { name: "Apply gradient" }).click();
    await expect(card).toHaveAttribute("data-gradient", "Forest");

    await card.getByRole("button", { name: "Edit holding" }).click();
    await page.getByLabel("Number of shares").fill("100");
    await page.getByLabel("Average purchase price (£)").fill("40");
    await page.getByLabel("Current holding value (£)").fill("5000");
    await page.getByLabel("Annual dividend yield (%)").fill("6");
    await capture("edit");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Realty Income, £5,000.00", exact: true })).toBeVisible();
    await expect(card.getByText("£300.00", { exact: true })).toBeVisible();
    await expect(card.getByText("£4,000.00", { exact: true })).toBeVisible();
    await expect(page.getByText("£16,520.00", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Cash", exact: true }).click();
    await page.getByRole("button", { name: "Zopa, £3,000.00", exact: true }).click();
    await expect(page.getByText("Annual rate", { exact: true })).toBeVisible();
    await expect(page.getByText("Average price", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Realty Income, £3,680.00", exact: true })).toBeVisible();
    expect(apiRequests).toEqual([]);
    expect(context.serviceWorkers()).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

test("narrow display and reduced motion keep cards, modal and custom colours usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype");
  const card = page.getByRole("button", { name: "Realty Income, £3,680.00", exact: true });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Change colour for Realty Income" }).click();
  await page.getByText("Create your own", { exact: true }).click();
  await page.getByLabel("First colour", { exact: true }).fill("#ffffff");
  await page.getByLabel("Second colour", { exact: true }).fill("#ffff00");
  await expect(page.getByText("Custom gradient", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Native dialog keeps keyboard focus inside while open.
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await page.getByRole("button", { name: "Apply gradient" }).click();
  await expect(page.locator("article").filter({ has: card })).toHaveAttribute("data-gradient", "Custom");
});
