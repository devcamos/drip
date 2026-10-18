import { test, expect } from "@playwright/test";

test("saved PRF passkey reopens encrypted accounts offline and after sign-out; recovery survives removal", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
  } });
  await page.goto("/"); const code = (await page.getByTestId("code").textContent())!;
  await page.getByLabel(/Gamertag/).fill("passkeytester"); await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Recovery" }).click();
  await page.getByLabel("Recovery code to set up passkey unlock").fill(code);
  await page.getByRole("button", { name: "Set up passkey unlock" }).click();
  await expect(page.getByText(/Passkey saved and verified/)).toBeVisible();
  const saved = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(saved.credentials).toHaveLength(1);
  expect(saved.credentials[0].isResidentCredential).toBe(true);
  expect(saved.credentials[0].rpId).toBe("localhost");
  // Assert persisted data contains neither a recovery root nor usable CryptoKeys.
  expect(await page.evaluate(async root => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("drip"); r.onsuccess = () => resolve(r.result); });
    return new Promise<boolean>(resolve => {
      const tx = db.transaction("kv"); const req = tx.objectStore("kv").getAll();
      const containsKey = (value: unknown): boolean => !!value && typeof value === "object" && (value instanceof CryptoKey || Object.values(value).some(containsKey));
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(req.result).includes(root) || containsKey(req.result)); };
    });
  }, code)).toBe(false);
  await page.reload(); await expect(page.getByRole("heading", { name: "Unlock Drip" })).toBeVisible();
  await expect(page.getByTestId("header-tag")).toHaveCount(0);
  await page.getByRole("button", { name: "Unlock with passkey", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("passkeytester");

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload();
  await page.getByRole("button", { name: "Unlock with passkey", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("passkeytester");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock with passkey", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("passkeytester");
  await page.getByRole("navigation").getByRole("button", { name: "Recovery" }).click();
  await page.getByRole("button", { name: "Remove passkey unlock" }).click();
  await expect(page.getByText(/removed from this browser/)).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Unlock Drip" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock with passkey", exact: true })).toHaveCount(0);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Unlock Drip", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("passkeytester");
});

test("ordinary saved passkeys without PRF do not enable encrypted unlock", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true, hasPrf: false,
  } });
  await page.goto("/"); const code = (await page.getByTestId("code").textContent())!;
  await page.getByLabel(/Gamertag/).fill("fallbacktester"); await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Recovery" }).click();
  await page.getByLabel("Recovery code to set up passkey unlock").fill(code);
  await page.getByRole("button", { name: "Set up passkey unlock" }).click();
  await expect(page.getByText(/does not support encrypted passkey unlock/)).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Unlock with passkey", exact: true })).toHaveCount(0);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Unlock Drip", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText("fallbacktester");
});
