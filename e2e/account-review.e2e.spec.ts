import { expect, test } from "@playwright/test";
import { legacyAccount } from "./legacy-account-helpers";
import { releaseSaver } from "../tests/saved-experience-fixtures";

test("reviews a saved account's figures and keeps the reminder complete after reload", async ({ page }) => {
  await legacyAccount(page, "review_demo", [releaseSaver()]);
  const task = page.getByRole("region", { name: "Review your figures" });
  await expect(task).toContainText("Interest rate");
  await page.getByRole("button", { name: "Review Zopa" }).click();
  const detail = page.getByRole("region", { name: "Review your figures" });
  await expect(detail).toContainText("Not confirmed yet");
  await page.getByRole("button", { name: "I’ve checked these figures" }).click();
  await expect(detail).toContainText("Review saved securely.");
  await expect(detail).toContainText("Up to date");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByRole("region", { name: "Review your figures" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Review your figures" })).toHaveCount(0);
});
