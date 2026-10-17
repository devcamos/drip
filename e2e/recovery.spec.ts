import { test, expect, type Page, type Locator } from "@playwright/test";

// These journeys share a host/IP. Respect real server Retry-After when several
// independent test users sign in quickly; never disable production auth limits.
async function withAuthRetry(page: Page, action: () => Promise<void>, success: Locator) {
  let retryMs = 10_100;
  const observe = (response: import("@playwright/test").Response) => {
    if (response.status() === 429 && response.url().includes("/api/auth/")) retryMs = (Number(response.headers()["retry-after"]) || 10) * 1000 + 100;
  };
  page.on("response", observe);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await action();
      await expect.poll(async () => await success.isVisible() ? "saved" : await page.getByText(/Too many sign-in attempts/).isVisible() ? "limited" : "pending", { timeout: 30_000 }).not.toBe("pending");
      if (await success.isVisible()) return;
      await page.waitForTimeout(retryMs);
    }
    await expect(success).toBeVisible();
  } finally { page.off("response", observe); }
}

async function setup(page: Page, handle = "recoverytest") {
  await page.goto("/");
  const code = (await page.getByTestId("code").textContent())!.trim();
  await page.getByLabel(/Gamertag/).fill(handle);
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
  await page.getByRole("navigation").getByRole("button", { name: "Recovery", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), page.getByText("Encrypted cloud copy saved.").first());

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
  await page.getByRole("navigation").getByRole("button", { name: "Recovery", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), page.getByText("Encrypted cloud copy saved.").first());
  await page.getByText("Device sign-in options").click();
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

test("downloaded set of six codes independently restores the same cloud account", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database.");
  test.setTimeout(180_000);
  const original = await setup(page);
  await page.getByRole("navigation").getByRole("button", { name: "Recovery", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(original);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), page.getByText("Encrypted cloud copy saved.").first());
  page.on("dialog", dialog => dialog.accept());
  await page.getByLabel("Your current recovery code").fill(original);
  await page.getByRole("button", { name: "Create six recovery codes" }).click();
  const list = page.getByRole("region", { name: "Recovery codes" }).getByRole("listitem");
  await expect(list).toHaveCount(6, { timeout: 30_000 });
  const codes = await list.allTextContents();
  expect(new Set(codes).size).toBe(6);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recovery codes" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("drip-recovery-codes.txt");
  const { readFile } = await import("node:fs/promises");
  const content = await readFile((await download.path())!, "utf8");
  expect(content.split("\n").filter(line => /^\d\. /.test(line))).toHaveLength(6);
  for (const code of codes) {
    const fresh = await browser.newContext();
    try {
      const returning = await fresh.newPage(); await returning.goto("http://localhost:4321");
      await returning.getByLabel("Recovery code", { exact: true }).fill(code);
      await withAuthRetry(returning, () => returning.getByRole("button", { name: "Restore cloud accounts" }).click(), returning.getByText("Total balance"));
      await expect(returning.getByText("£3,000.00").first()).toBeVisible();
      await returning.reload();
      await expect(returning.getByText("Total balance")).toBeVisible();
    } finally { await fresh.close(); }
  }
  // Downloaded wrappers never expose the primary recovery code in the text file.
  expect(content).not.toContain(original);
});

test("mobile Trends shows recorded and estimated balances with editable assumptions", async ({ page }) => {
  await setup(page);
  await page.getByRole("navigation").getByRole("button", { name: "Trends", exact: true }).click();
  await expect(page.getByRole("img", { name: /Recorded balance/ })).toBeVisible();
  await expect(page.getByText(/Your history starts today/)).toBeVisible();
  await page.getByRole("button", { name: "Edit projection" }).click();
  await page.getByLabel("Planned monthly top-up (£)").fill("200");
  await page.getByLabel("Project ahead").selectOption("3");
  await page.getByRole("button", { name: "Save projection" }).click();
  await expect(page.getByText("Estimated balance in 3 years")).toBeVisible();
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Trends", exact: true }).click();
  await expect(page.getByText("Estimated balance in 3 years")).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "/tmp/drip-trends-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "3m", exact: true }).click();
  await expect(page.getByText("Your balance today")).toBeVisible();
  await page.getByText("View chart figures").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Estimate", exact: true })).toHaveCount(0);
});

test("sign-out survives reload, locks other tabs and preserves local-only accounts", async ({ page, context }) => {
  const code = await setup(page);
  const other = await context.newPage(); await other.goto("/");
  await expect(other.getByText("Total balance")).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await expect(page.getByText("£3,000.00")).toHaveCount(0);
  await page.getByLabel("Recovery code", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That isn't your recovery code.")).toBeVisible();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Total balance")).toBeVisible();
  await expect(page.getByText("£3,000.00").first()).toBeVisible();
  await expect(other.getByText("Total balance")).toBeVisible(); await other.close();
});

test("offline sign-out keeps queued top-ups and online sign-out revokes the server session", async ({ page, context }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database.");
  test.setTimeout(120_000);
  const code = await setup(page);
  await page.getByRole("navigation").getByRole("button", { name: "Recovery", exact: true }).click();
  await page.getByLabel("Your saved recovery code").fill(code);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), page.getByText("Encrypted cloud copy saved.").first());
  await page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: /Zopa/ }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Top up", exact: true }).click();
  await page.getByLabel("amount", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".bal")).toHaveText("£3,200.00");
  let warned = false;
  page.on("dialog", async dialog => { warned ||= dialog.message().includes("unsynced changes"); await dialog.accept(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  expect(warned).toBe(true);
  await expect(page.getByText(/not yet confirmed/)).toBeVisible();
  await page.reload();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("£3,200.00").first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Encrypted cloud copy saved.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out" })).toBeVisible();
  await expect.poll(async () => (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Sign in", exact: true }).click(), page.getByText("Total balance"));
  await expect(page.getByText("£3,200.00").first()).toBeVisible();
});

test("signed-out users can restore rampage201 instead of reopening the current profile", async ({ page, browser }) => {
  test.skip(!process.env.DRIP_CLOUD_E2E, "Requires the isolated Preview database.");
  test.setTimeout(120_000);
  const original = await browser.newContext(); let recovery: string;
  try {
    const originalPage = await original.newPage(); recovery = await setup(originalPage, "rampage201");
    await originalPage.getByRole("navigation").getByRole("button", { name: "Recovery", exact: true }).click();
    await originalPage.getByLabel("Your saved recovery code").fill(recovery);
    await withAuthRetry(originalPage, () => originalPage.getByRole("button", { name: "Enable encrypted cloud recovery" }).click(), originalPage.getByText("Encrypted cloud copy saved.").first());
  } finally { await original.close(); }
  await setup(page, "newprofile");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Use another account", { exact: true }).click();
  await page.getByLabel("Other account recovery code", { exact: true }).fill(recovery!);
  await withAuthRetry(page, () => page.getByRole("button", { name: "Restore cloud accounts" }).click(), page.getByText("Total balance"));
  await expect(page.getByTestId("header-tag").locator("b")).toHaveText("rampage201");
  await expect(page.getByText("£3,000.00").first()).toBeVisible();
  await page.reload(); await expect(page.getByTestId("header-tag").locator("b")).toHaveText("rampage201");
});
