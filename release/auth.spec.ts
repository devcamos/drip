import { randomBytes } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authTestTarget } from "./target";
import { withAuthRetry } from "../e2e/auth-helpers";
const target = authTestTarget();
function checkpoint(value: string) { test.info().annotations.push({ type: "checkpoint", description: value }); }

async function authenticate(context: BrowserContext) {
  if (target.local) return;
  const response = await context.request.get(target.origin, {
    headers: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET!, "x-vercel-set-bypass-cookie": "true" },
    maxRedirects: 0,
  });
  const location = response.headers().location;
  if (location && new URL(location, target.origin).origin !== target.origin) throw new Error("Deployment protection redirected outside the verified origin.");
  if (response.status() >= 400 || !(await context.cookies(target.origin)).some(cookie => cookie.name === "_vercel_jwt" && cookie.secure && cookie.domain.replace(/^\./, "") === new URL(target.origin).hostname)) throw new Error("Deployment protection did not establish a scoped cookie.");
}
async function readiness(context: BrowserContext) {
  const build = await context.request.get("/sw-build.js", { maxRedirects: 0 });
  expect(build.status()).toBe(200);
  expect(await build.text()).toContain(`${target.sha}-`);
  const status = await context.request.get("/api/cloud/status", { maxRedirects: 0 });
  expect(status.status()).toBe(200);
  expect((await status.json()).available).toBe(true);
}
async function login(page: Page, username: string, password: string) {
  await page.goto(`${target.origin}/#login`);
  const form = page.getByRole("form", { name: "Password sign-in", exact: true });
  await form.getByLabel("Sign-in gamertag", { exact: true }).fill(username);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await withAuthRetry(page, () => form.getByRole("button", { name: "Sign in with password", exact: true }).click(), page.getByTestId("header-tag"));
  await expect(page.getByTestId("header-tag")).toContainText(username);
  const session = await page.request.get("/api/auth/get-session", { maxRedirects: 0 });
  expect(session.status()).toBe(200);
  expect((await session.json())?.user?.id).toBeTruthy();
}
async function signOut(page: Page) {
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drip is signed out", exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get("/api/auth/get-session", { maxRedirects: 0 });
    return response.status() === 200 && await response.json() === null;
  }).toBe(true);
}
function money(value: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value)); }

test.beforeEach(async ({ context }) => { checkpoint("readiness"); await authenticate(context); await readiness(context); });
test.afterEach(async ({ context }) => {
  // Best effort cleanup even after an assertion fails; no exported auth state.
  await context.request.post("/api/auth/sign-out", { headers: { origin: target.origin }, data: {}, maxRedirects: 0 }).catch(() => {});
  await readiness(context);
});

test("existing account still signs in and restores its saved balance", async ({ page }) => {
  checkpoint("existing-login");
  await login(page, process.env.DRIP_AUTH_EXISTING_TAG!, process.env.DRIP_AUTH_EXISTING_PASSWORD!);
  await expect(page.getByText(money(process.env.DRIP_AUTH_EXISTING_BALANCE!), { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await signOut(page);
});

test("signup, sign-out and fresh-device login restore saved account data", async ({ page, browser }) => {
  checkpoint("signup");
  const username = `gate_${randomBytes(5).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  await page.goto(`${target.origin}/#signup`);
  const form = page.getByRole("form", { name: "Sign up", exact: true });
  await form.getByLabel(/Gamertag/).fill(username);
  await form.getByLabel("Create password", { exact: true }).fill(password);
  await form.getByLabel("Confirm new account password", { exact: true }).fill(password);
  checkpoint("signup-submit");
  await withAuthRetry(page, () => form.getByRole("button", { name: "Create account", exact: true }).click(), page.getByTestId("header-tag"));
  checkpoint("signup-accounts");
  await expect(page.getByText(/^No accounts yet\./)).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button", { name: "Accounts", exact: true })).toHaveClass("on");
  checkpoint("cloud-save");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Balance", { exact: true }).fill("1234.56");
  await page.getByLabel("Rate", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Cloud copy is up to date.", { exact: true })).toBeVisible({ timeout: 75_000 });
  checkpoint("sign-out");
  await signOut(page);
  const fresh = await browser.newContext({ baseURL: target.origin, serviceWorkers: "block" });
  try {
    checkpoint("fresh-device-restore");
    await authenticate(fresh); await readiness(fresh);
    const other = await fresh.newPage();
    await login(other, username, password);
    await expect(other.getByText(money("1234.56"), { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await signOut(other);
  } finally {
    await fresh.request.post("/api/auth/sign-out", { headers: { origin: target.origin }, data: {}, maxRedirects: 0 }).catch(() => {});
    await fresh.close();
  }
});
