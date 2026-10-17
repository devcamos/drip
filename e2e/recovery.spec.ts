import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.goto("/");
  const code = (await page.getByTestId("code").textContent())!.trim();
  await page.getByLabel(/Gamertag/).fill("recoverytest");
  await page.getByLabel(/saved my recovery code/).check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Balance", { exact: true }).fill("3000");
  await page.getByLabel("Rate", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return code;
}

test("offline reload keeps accounts and never caches private APIs", async ({ page, context }) => {
  await setup(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Authenticated endpoints must not enter any service-worker cache.
  await page.request.get("/api/cloud/status");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Total balance")).toBeVisible();
  await expect(page.getByText("£3,000.00").first()).toBeVisible();
  await expect(page.getByText(/Offline — Drip/)).toBeVisible();
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(req => new URL(req.url).pathname)))).flat());
  expect(urls.some(path => path.startsWith("/api/"))).toBe(false);
  await context.setOffline(false);
});

test("cloud copy survives a fresh device, offline edits queue, and stale devices cannot overwrite it", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database; no production credentials in normal CI.");
  const code = await setup(page);
  await page.getByRole("navigation").getByRole("button", { name: "Backup", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click();
  await expect(page.getByText("Encrypted cloud copy saved.")).toBeVisible({ timeout: 30_000 });

  const second = await browser.newContext(); const returning = await second.newPage();
  try {
    await returning.goto("http://localhost:4321");
    await returning.getByLabel("Recovery code", { exact: true }).fill(code);
    await returning.getByRole("button", { name: "Restore cloud accounts" }).click();
    await expect(returning.getByText("Total balance")).toBeVisible({ timeout: 30_000 });
    await expect(returning.getByText("£3,000.00").first()).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true }).click();
    await page.getByRole("button", { name: /Zopa/ }).click();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Top up", exact: true }).click();
    await page.getByLabel("amount", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".bal")).toHaveText("£3,200.00");
    await page.context().setOffline(false);
    await expect(page.getByText("Encrypted cloud copy saved.")).toBeVisible({ timeout: 30_000 });

    await returning.getByRole("button", { name: /Zopa/ }).click();
    await returning.getByRole("button", { name: "Top up", exact: true }).click();
    await returning.getByLabel("amount", { exact: true }).fill("50");
    await returning.getByRole("button", { name: "Save", exact: true }).click();
    await expect(returning.getByText(/Cloud changed on another device/)).toBeVisible({ timeout: 30_000 });
    await expect(returning.locator(".bal")).toHaveText("£3,050.00");
    const session = await (await page.request.get("/api/auth/get-session")).json();
    const remote = await (await page.request.get("/api/cloud", { headers: { "X-Drip-Owner": session.user.id } })).json();
    expect(remote.version).toBe(2);
    expect(remote.envelope.app).toBe("drip-cloud");
    expect(remote.envelope).not.toHaveProperty("accounts");

    // An unauthenticated browser cannot read any vault.
    const outsider = await browser.newContext();
    expect((await outsider.request.get("http://localhost:4321/api/cloud")).status()).toBe(401);
    await outsider.close();
    expect((await page.request.put("/api/cloud", { headers: { origin: "https://untrusted.example" }, data: { version: 2, envelope: remote.envelope } })).status()).toBe(403);
  } finally { await page.context().setOffline(false); await second.close(); }
});

test("cloud passkey verifies on the server, while new-device decryption still requires the code", async ({ page, context }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database.");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const code = await setup(page);
  await page.getByRole("navigation").getByRole("button", { name: "Backup", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click();
  await expect(page.getByText("Encrypted cloud copy saved.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add cloud sign-in passkey" }).click();
  await expect(page.getByText(/Cloud sign-in passkey saved/)).toBeVisible({ timeout: 30_000 });
  await context.clearCookies();
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase("drip"); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }));
  await page.reload();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page.getByText(/Signed in. Enter your recovery code/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Restore cloud accounts" })).toBeDisabled();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Restore cloud accounts" }).click();
  await expect(page.getByText("Total balance")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("£3,000.00").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Total balance")).toBeVisible();
});
