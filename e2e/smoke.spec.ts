import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });

async function onboard(page: Page) {
  await page.goto("/");
  const code = (await page.getByTestId("code").textContent())!.trim();
  await page.getByLabel(/Gamertag/).fill("devo");
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
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled(); // no gamertag yet
  await page.getByLabel(/Gamertag/).fill("me@mail");
  await expect(page.getByText("Only letters, numbers and underscore.")).toBeVisible();
  await page.getByLabel(/Gamertag/).fill("de");
  await expect(page.getByText("Use at least 3 characters.")).toBeVisible();
  await page.getByLabel(/Gamertag/).fill("devo_1");
  await expect(page.getByTestId("tag-preview")).toHaveText("You'll be devo_1");
  await expect(page.getByRole("button", { name: /Reroll/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByTestId("header-tag")).toHaveText("💧 Drip · devo_1");
  await page.getByRole("navigation").getByRole("button", { name: "Backup" }).click();
  await expect(page.getByTestId("settings-tag")).toHaveText("devo_1");
  await expect(page.getByText(/If this name is taken when sync launches, we'll add a short number to it/)).toBeVisible();
});

test("add account, top up, withdraw, Trends, backup export and import", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const code = await onboard(page);
  const tag = (await page.getByTestId("header-tag").locator("b").textContent());
  expect(tag).toBe("devo");
  await addZopa(page);
  await expect(page.getByText("£3,000.00").first()).toBeVisible();

  // top-up
  await page.getByRole("button", { name: "Top up" }).click();
  await page.getByLabel("amount", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("events")).toContainText("+£500.00");
  await expect(page.getByText("£3,500.00").first()).toBeVisible();

  // withdraw: over-balance rejected, then valid
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByLabel("amount", { exact: true }).fill("99999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("can't withdraw more than the balance")).toBeVisible();
  await page.getByLabel("amount", { exact: true }).fill("200");
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
  await expect(p2.getByTestId("header-tag")).toContainText(tag!); // gamertag restored from backup
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

test("existing install without a gamertag is asked for one on next open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("drip", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => r(q.result); });
    await new Promise((r) => { const t = db.transaction("kv", "readwrite");
      t.objectStore("kv").put({ version: 1, accounts: [], snapshots: [], lastBackupAt: null }, "data");
      t.objectStore("kv").put({ salt: "AAAA", hash: "x" }, "verifier"); t.oncomplete = r; });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pick your gamertag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save gamertag" })).toBeDisabled();
  await page.getByLabel(/Gamertag/).fill("oldfriend");
  await page.getByRole("button", { name: "Save gamertag" }).click();
  await expect(page.getByTestId("header-tag")).toHaveText("💧 Drip · oldfriend");
  await page.reload();
  await expect(page.getByTestId("header-tag")).toHaveText("💧 Drip · oldfriend");
});

test("app-lock passkey uses the gamertag as its user name and the account id as user id", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await onboard(page);
  const tag = await page.getByTestId("header-tag").locator("b").textContent();
  await page.getByRole("navigation").getByRole("button", { name: "Backup" }).click();
  await page.getByRole("button", { name: "Turn on app lock" }).click();
  await expect(page.getByText("App lock is on.")).toBeVisible();
  const id: string = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("drip", 1); q.onsuccess = () => r(q.result); });
    return new Promise((r) => { const g = db.transaction("kv").objectStore("kv").get("data"); g.onsuccess = () => r(g.result.identity.id); });
  });
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  const userHex = Buffer.from(credentials[0].userHandle!, "base64").toString("hex");
  expect(userHex).toBe(id.replace(/-/g, ""));
  if ((credentials[0] as any).userName !== undefined) expect((credentials[0] as any).userName).toBe("devo");
  expect(tag).toBe("devo");
});
