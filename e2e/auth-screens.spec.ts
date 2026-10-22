import { test, expect } from "@playwright/test";

test("login, signup and recovery stay separate and support browser history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Create password", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("code")).toHaveCount(0);
  await page.getByLabel("Password", { exact: true }).fill("synthetic unsent password");

  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/#signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Create password", { exact: true }).fill("synthetic unsent signup password");
  await page.goBack();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.goForward();
  await expect(page.getByLabel("Create password", { exact: true })).toHaveValue("");

  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recover your account" })).toBeFocused();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Create password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore a backup", exact: true }).click();
  await expect(page.getByLabel("Backup file", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Backup file", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
