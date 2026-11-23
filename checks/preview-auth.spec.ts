import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

test.use({ screenshot: "off", trace: "off", video: "off" });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Checkly Preview configuration is missing ${name}.`);
  return value;
}

const baseUrl = required("DRIP_PREVIEW_URL");
const loginTag = required("DRIP_CHECKLY_GAMERTAG");
const password = required("DRIP_CHECKLY_PASSWORD");
const accountLabel = required("DRIP_CHECKLY_ACCOUNT_LABEL");
const expectedBalance = required("DRIP_CHECKLY_EXPECTED_BALANCE");
const bypass = required("VERCEL_AUTOMATION_BYPASS_SECRET");

async function openPreview(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-vercel-protection-bypass": bypass },
  });
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.accept());
  await page.goto(new URL("/", baseUrl).toString());
  return { context, page };
}

async function signIn(page: Page) {
  const form = page.getByRole("form", { name: "Password sign-in", exact: true });
  await form.getByLabel("Gamertag", { exact: true }).fill(loginTag);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("header-tag")).toContainText(loginTag);
  const card = page.getByRole("region", { name: "Account cards", exact: true }).getByRole("button", {
    name: new RegExp(accountLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  });
  await expect(card).toContainText(expectedBalance);
}

async function signOutAndConfirm(context: BrowserContext, page: Page) {
  await page.getByRole("button", { name: /Open profile and settings for/ }).click();
  await page.getByRole("dialog", { name: "Profile & settings", exact: true })
    .getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Drip" })).toBeVisible();

  const response = await context.request.get(new URL("/api/auth/get-session", baseUrl).toString(), {
    headers: { "x-vercel-protection-bypass": bypass },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
}

async function ensureServerSessionClosed(context: BrowserContext, page: Page) {
  const sessionUrl = new URL("/api/auth/get-session", baseUrl).toString();
  const headers = { "x-vercel-protection-bypass": bypass };
  const readSession = async () => {
    try {
      const response = await context.request.get(sessionUrl, { headers });
      return response.ok() ? await response.json() : undefined;
    } catch {
      return undefined;
    }
  };

  if (await readSession() === null) return;
  try {
    await page.goto(new URL("/", baseUrl).toString());
    const profile = page.getByRole("button", { name: /Open profile and settings for/ });
    if (await profile.isVisible()) {
      await profile.click();
      await page.getByRole("dialog", { name: "Profile & settings", exact: true })
        .getByRole("button", { name: "Sign out", exact: true }).click();
    }
  } catch {
    // A failed assertion or unavailable UI should still try server-side cleanup.
  }

  if (await readSession() === null) return;
  const response = await context.request.post(new URL("/api/auth/sign-out", baseUrl).toString(), {
    headers: { ...headers, origin: new URL(baseUrl).origin },
  });
  expect(response.ok()).toBe(true);
  expect(await readSession()).toBeNull();
}

async function verifyInFreshContext(browser: Browser) {
  const { context, page } = await openPreview(browser);
  try {
    await signIn(page);
    await signOutAndConfirm(context, page);
  } finally {
    try {
      await ensureServerSessionClosed(context, page);
    } finally {
      await context.close();
    }
  }
}

test("Preview login restores the synthetic balance in a fresh browser and signs out", async ({ browser }) => {
  await verifyInFreshContext(browser);
  await verifyInFreshContext(browser);
});
