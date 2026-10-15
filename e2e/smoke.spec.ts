import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });

async function onboard(page: Page) {
  await page.goto("/");
  const code = (await page.getByTestId("code").textContent())!.trim();
  await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start" }).click();
  return code;
}

async function addZopa(page: Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Add" }).click();
  await page.locator("select").first().selectOption("Zopa");
  await page.getByPlaceholder("e.g. Rainy day pot").fill("Rainy day pot");
  await page.getByPlaceholder("3000").fill("3000");
  await page.getByPlaceholder("7").fill("7");
  await expect(page.getByText("≈ £17.50 a month")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
}

test("onboarding shows a recovery code and gates Start", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("code")).toHaveText(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
});

test("add account, top up, withdraw, Trends, backup export and import", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const code = await onboard(page);
  await addZopa(page);
  await expect(page.getByText("£3,000.00").first()).toBeVisible();

  // top-up
  await page.getByRole("button", { name: "Top up" }).click();
  await page.getByLabel("amount").fill("500");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("events")).toContainText("+£500.00");
  await expect(page.getByText("£3,500.00").first()).toBeVisible();

  // withdraw: over-balance rejected, then valid
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByLabel("amount").fill("99999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("can't withdraw more than the balance")).toBeVisible();
  await page.getByLabel("amount").fill("200");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("events")).toContainText("−£200.00");
  await expect(page.getByText("£3,300.00").first()).toBeVisible();

  // Trends
  await page.getByRole("navigation").getByRole("button", { name: "Trends" }).click();
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  await expect(page.getByText("£3,300.00")).toBeVisible();
  await expect(page.getByText("7.00%")).toBeVisible();
  await expect(page.getByText(/In 12 months:/)).toBeVisible();

  // export
  await page.getByRole("navigation").getByRole("button", { name: "Backup" }).click();
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX").fill("WRONG");
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX").fill(code);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const file = await (await dl).path();
  await expect(page.getByText("Backup saved.")).toBeVisible();
  const json = JSON.parse(readFileSync(file, "utf8"));
  expect(json.app).toBe("drip");
  expect(JSON.stringify(json)).not.toContain("Rainy");

  // import into a fresh device (new context = empty IndexedDB)
  const fresh = await page.context().browser()!.newContext();
  const p2 = await fresh.newPage();
  await p2.goto("/");
  await p2.getByRole("button", { name: "Restore a backup" }).click();
  await p2.locator('input[type="file"]').setInputFiles(file);
  const codeInput = p2.locator("input").nth(1);
  await codeInput.fill(code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"));
  await p2.getByRole("button", { name: "Restore" }).click();
  await expect(p2.getByText(/Wrong recovery code/)).toBeVisible();
  await codeInput.fill(code);
  await p2.getByRole("button", { name: "Restore" }).click();
  await expect(p2.getByText("Rainy day pot")).toBeVisible();
  await expect(p2.getByText("£3,300.00").first()).toBeVisible();
  await fresh.close();
});

test("app lock: passkey required on open, recovery code fallback", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const code = await onboard(page);
  await page.getByRole("navigation").getByRole("button", { name: "Backup" }).click();
  await expect(page.getByText(/screen lock only/)).toBeVisible();
  await page.getByRole("button", { name: "Turn on app lock" }).click();
  await expect(page.getByText("App lock is on.")).toBeVisible();

  // reopen: passkey verifies automatically
  await page.reload();
  await expect(page.getByText("No accounts yet")).toBeVisible();

  // passkey fails -> fallback to recovery code
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
  await page.reload();
  await expect(page.getByRole("heading", { name: /locked/ })).toBeVisible();
  await page.locator("input").fill("WRONG");
  await page.getByRole("button", { name: "Unlock with code" }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  await page.locator("input").fill(code);
  await page.getByRole("button", { name: "Unlock with code" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
});
