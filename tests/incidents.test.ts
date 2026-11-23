import { afterEach, expect, it, vi } from "vitest";
import { sendIncident, withApiIncidents } from "../server/incidents";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not page or annotate expected client failures", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => Response.json({ error: "invalid input" }, { status: 422 }));
  const response = await handler(new Request("https://drip.example/api/recovery-codes"));
  expect(response.status).toBe(422);
  expect(response.headers.has("x-drip-incident-reference")).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("reports 5xx with a correlation reference and only privacy-safe fields", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  vi.stubEnv("VERCEL_ENV", "preview");
  const fetcher = vi.fn(async () => new Response("ok", { status: 200 })); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => Response.json({ error: "private database text" }, { status: 503 }));
  const response = await handler(new Request("https://drip.example/api/auth/sign-in/gamertag?username=Rampage29", { method: "POST" }));
  const reference = response.headers.get("x-drip-incident-reference");
  expect(reference).toMatch(/^[0-9a-f-]{36}$/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe("https://hooks.slack.com/services/T000/B000/placeholder");
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.redirect).toBe("error");
  const payload = JSON.parse(String(init.body)) as { text: string };
  expect(payload.text).toContain(`Drip server incident ${reference}`);
  expect(payload.text).toContain("Environment: preview");
  expect(payload.text).toContain("POST /api/auth/[action] returned HTTP 503");
  expect(payload.text).toContain("Http5xxResponse");
  expect(payload.text).not.toMatch(/Rampage29|username=|private database text|cookie|recovery/i);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rampage29|private database text/);
});

it("converts thrown exceptions to a safe 500 while preserving useful server correlation", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://hooks.slack.com/services/T000/B000/placeholder");
  const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response("ok")); vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = withApiIncidents(async (_request: Request) => { throw new Error("password=ultra-secret Recovery code 1234-1234"); });
  const response = await handler(new Request("https://drip.example/api/cloud/12345678901234567890", { method: "PUT" }));
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.error).toBe("Drip could not complete this request. Try again shortly.");
  expect(body.reference).toBe(response.headers.get("x-drip-incident-reference"));
  expect(JSON.stringify(body)).not.toMatch(/ultra-secret|1234-1234/);
  const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { text: string };
  expect(payload.text).toContain("PUT /api/[route] returned HTTP 500");
  expect(payload.text).toContain("Error: Error; authentication dependency failed; fingerprint ");
  expect(payload.text).not.toMatch(/ultra-secret|1234-1234|password=/);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/ultra-secret|1234-1234/);
});

it("keeps the original 5xx response when the Slack hook is absent or invalid", async () => {
  vi.stubEnv("DRIP_INCIDENT_SLACK_WEBHOOK", "https://example.com/collect");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sendIncident({ reference: "ref", environment: "preview", method: "GET", route: "/api/cloud", status: 503, errorType: "Http5xxResponse", summary: "handler returned a server error", fingerprint: "123456abcdef" })).resolves.toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
  const handler = withApiIncidents(async (_request: Request) => new Response("service unavailable", { status: 503, headers: { "cache-control": "no-store" } }));
  const response = await handler(new Request("https://drip.example/api/cloud"));
  …2078 tokens truncated…put.tsx",
        "app/RecoveryCodes.tsx",
        "app/RecoveryTask.tsx",
        "app/api/recovery-codes/route.ts",
        "lib/crypto.ts",
        "lib/original-recovery-codes.ts",
        "lib/recovery-codes.ts",
        "lib/recovery-file.ts",
        "lib/recovery-readiness.ts"
      ],
      "tests": [
        "tests/recovery-api.test.ts",
        "tests/crypto.test.ts",
        "tests/recovery-codes.test.ts",
        "tests/recovery-file.test.ts",
        "tests/original-recovery-codes.test.ts",
        "tests/recovery-codes-ui.test.tsx",
        "tests/recovery-autofill.test.tsx",
        "tests/recovery-input-ui.test.tsx",
        "tests/recovery-code-readiness.test.ts",
        "tests/recovery-readiness.test.ts",
        "tests/recovery-task-ui.test.tsx",
        "e2e/recovery.spec.ts",
        "e2e/guided-recovery.spec.ts",
        "e2e/original-recovery.spec.ts",
        "integration/account-http.integration.test.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/recovery-boundaries.unit.test.ts",
        "tests/account-review.integration.test.tsx",
        "tests/incidents.test.ts"
      ]
    },
    {
      "id": "vault",
      "name": "Encrypted local storage, account switching and locked-state safety",
      "sources": [
        "lib/account-switch.ts",
        "lib/db.ts",
        "lib/trusted-session.ts",
        "lib/draft.ts",
        "lib/local-vault.ts"
      ],
      "tests": [
        "tests/db.test.ts",
        "tests/local-vault.test.ts",
        "tests/local-vault-crypto.test.ts",
        "tests/storage-validation.test.ts",
        "tests/signup-replacement.test.ts",
        "tests/vault-ui.test.tsx",
        "e2e/local-vault.spec.ts",
        "e2e/save-confidence.spec.ts",
        "tests/saved-experience.integration.test.tsx",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/recovery-boundaries.unit.test.ts",
        "tests/trusted-device.test.ts",
        "tests/trusted-session.test.ts"
      ]
    },
    {
      "id": "cloud",
      "name": "Encrypted cloud sync, conflicts, version compatibility and restored data",
      "sources": [
        "app/api/cloud/route.ts",
        "app/api/cloud/status/route.ts",
        "lib/cloud-payload.ts",
        "lib/cloud.ts",
        "lib/data-format.ts",
        "server/cloud-store.ts"
      ],
      "tests": [
        "tests/cloud-api.test.ts",
        "tests/cloud.test.ts",
        "tests/cloud-ui.test.tsx",
        "tests/cloud-sync-ui.test.tsx",
        "tests/investment-format-compatibility.test.ts",
        "tests/upload-ack.test.ts",
        "e2e/recovery.spec.ts",
        "e2e/password-login.spec.ts",
        "e2e/products.spec.ts",
        "integration/account-http.integration.test.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "integration/saved-experience-http.integration.test.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/domain-boundaries.unit.test.ts",
        "tests/cloud-sync.unit.test.ts",
        "tests/account-review.integration.test.tsx",
        "tests/incidents.test.ts"
      ]
    },
    {
      "id": "devices",
      "name": "Four-device admission, targeted revocation and signout races",
      "sources": [
        "app/DeviceManagement.tsx",
        "app/DeviceSession.tsx",
        "lib/device-management.ts",
        "lib/device-policy.ts",
        "lib/device-session.ts",
        "server/device-sessions.ts",
        "server/manage-devices.ts"
      ],
      "tests": [
        "tests/device-sessions.test.ts",
        "tests/device-sessions-http.test.ts",
        "tests/device-session.test.ts",
        "tests/device-session-ui.test.tsx",
        "tests/device-management-client.test.ts",
        "tests/device-management-ui.test.tsx",
        "tests/device-management-race.test.tsx",
        "e2e/device-management.spec.ts",
        "e2e/four-device-signin.spec.ts",
        "integration/device-management.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/device-management.unit.test.ts"
      ]
    },
    {
      "id": "passkeys",
      "name": "Passkey registration/unlock and recovery alternatives",
      "sources": [
        "app/PasskeyUnlock.tsx",
        "lib/lock.ts",
        "lib/passkey-crypto.ts",
        "lib/passkey-unlock.ts"
      ],
      "tests": [
        "tests/lock.test.ts",
        "tests/passkey-ui.test.tsx",
        "tests/passkey-unlock.test.ts",
        "e2e/passkey-unlock.spec.ts",
        "tests/credential-validation.unit.test.ts",
        "e2e/smoke.spec.ts"
      ]
    },
    {
      "id": "accounts",
      "name": "Account editing, providers, categories and colours",
      "sources": [
        "app/AccountDetail.tsx",
        "app/AccountForm.tsx",
        "lib/account-colour.ts",
        "lib/products.ts"
      ],
      "tests": [
        "tests/account-options.test.tsx",
        "tests/products-ui.test.tsx",
        "tests/income.test.ts",
        "e2e/account-options.spec.ts",
        "e2e/account-wallet.spec.ts",
        "e2e/products.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/domain-boundaries.unit.test.ts",
        "tests/stock-reading.integration.test.tsx",
        "e2e/stock-reading.e2e.spec.ts",
        "tests/account-review.integration.test.tsx"
      ]
    },
    {
      "id": "calculations",
      "name": "Balances, topups, withdrawals, rate changes and income arithmetic",
      "sources": [
        "lib/maths.ts",
        "lib/types.ts"
      ],
      "tests": [
        "tests/maths.test.ts",
        "tests/maths-refactor.test.ts",
        "tests/gaps.test.ts",
        "tests/daily.test.ts",
        "tests/topup.test.ts",
        "tests/income.test.ts",
        "tests/income-remove-ui.test.tsx",
        "e2e/income-update.spec.ts",
        "e2e/products.spec.ts",
        "e2e/smoke.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "e2e/rate-change.spec.ts",
        "tests/month-history.test.ts",
        "tests/account-review.integration.test.tsx"
      ]
    },
    {
      "id": "dividends",
      "name": "Dividend portfolio and received-income totals",
      "sources": [
        "app/DividendPortfolio.tsx",
        "app/IncomeSummary.tsx",
        "lib/dividend-portfolio.ts"
      ],
      "tests": [
        "tests/income.test.ts",
        "tests/income-remove-ui.test.tsx",
        "tests/stock-investment-ui.test.tsx",
        "tests/stock-investment.test.ts",
        "e2e/stock-investment.spec.ts",
        "e2e/income-notifications.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts"
      ]
    },
    {
      "id": "holdings",
      "name": "Shares, acquisition cost, valuation and yield",
      "sources": [
        "app/StockInvestment.tsx",
        "lib/stock-investment.ts",
        "lib/decimal-input.ts"
      ],
      "tests": [
        "tests/stock-investment.test.ts",
        "tests/stock-investment-ui.test.tsx",
        "e2e/stock-investment.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/domain-boundaries.unit.test.ts"
      ]
    },
    {
      "id": "fx",
      "name": "Daily FX estimates and bounded upstream API failures",
      "sources": [
        "app/CurrencyEstimate.tsx",
        "app/api/exchange-rates/route.ts",
        "lib/exchange-rates.ts",
        "server/exchange-rates.ts"
      ],
      "tests": [
        "tests/exchange-rates.test.ts",
        "tests/currency-estimate.test.tsx",
        "e2e/exchange-rates.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/domain-boundaries.unit.test.ts",
        "tests/incidents.test.ts",
        "tests/incident-api.integration.test.ts"
      ]
    },
    {
      "id": "forecasts",
      "name": "Trends, forecasts and deposit assumptions",
      "sources": [
        "app/Trends.tsx"
      ],
      "tests": [
        "tests/trends.test.tsx",
        "tests/trends-ui.test.tsx",
        "tests/maths.test.ts",
        "tests/gaps.test.ts",
        "e2e/smoke.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/month-history.test.ts"
      ]
    },
    {
      "id": "calendar",
      "name": "Expected payments, recurrence and reminders",
      "sources": [
        "app/PaymentCalendar.tsx",
        "app/PaymentNotifications.tsx",
        "app/useCalendarDay.ts",
        "lib/payment-calendar.ts",
        "lib/payment-reminders.ts"
      ],
      "tests": [
        "tests/payment-calendar.test.ts",
        "tests/payment-calendar.integration.test.tsx",
        "tests/income-reminders.test.ts",
        "tests/income-notifications-ui.test.tsx",
        "e2e/payment-calendar.e2e.spec.ts",
        "e2e/income-notifications.spec.ts",
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts"
      ]
    },
    {
      "id": "notifications",
      "name": "Phone-reminder enrolment, scheduling, limits and dispatch",
      "sources": [
        "app/PhoneReminders.tsx",
        "app/api/notifications/config/route.ts",
        "app/api/notifications/dispatch/route.ts",
        "app/api/notifications/subscription/route.ts",
        "app/api/notifications/test/route.ts",
        "lib/phone-reminders.ts",
        "scripts/payment-notifications.sql",
        "server/notifications/api.ts",
        "server/notifications/config.ts",
        "server/notifications/crypto.ts",
        "server/notifications/dispatch.ts",
        "server/notifications/model.ts",
        "server/notifications/runtime.ts",
        "server/notifications/store.ts"
      ],
      "tests": [
        "tests/notifications-security.test.ts",
        "tests/phone-reminders.test.ts",
        "tests/income-notifications-ui.test.tsx",
        "e2e/income-notifications.spec.ts",
        "integration/notifications-postgres.test.ts",
        "integration/notification-rate-limits.test.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/domain-boundaries.unit.test.ts",
        "tests/notification-boundaries.unit.test.ts",
        "tests/incidents.test.ts"
      ]
    },
    {
      "id": "pwa",
      "name": "Install task, offline shell, safe worker updates and data retention",
      "sources": [
        "app/InstallTask.tsx",
        "app/PwaStatus.tsx",
        "app/sw-build.js/route.ts",
        "lib/worker-safety.ts",
        "public/apple-touch-icon.png",
        "public/icon-192.png",
        "public/icon-512.png",
        "public/icon-maskable-512.png",
        "public/manifest.webmanifest",
        "public/sw.js"
      ],
      "tests": [
        "tests/install-task.test.tsx",
        "tests/pwa.test.tsx",
        "tests/pwa-build.test.ts",
        "tests/service-worker.test.ts",
        "tests/worker-safety.test.ts",
        "e2e/install-task.spec.ts",
        "e2e/pwa-update.spec.ts",
        "e2e/signin-update.spec.ts",
        "e2e/pwa-current-update.e2e.spec.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts"
      ]
    },
    {
      "id": "prototype",
      "name": "Design prototypes and Preview-only routes",
      "sources": [
        "app/prototype/HoldingsPrototype.tsx",
        "app/prototype/holdings.ts",
        "app/prototype/page.tsx",
        "app/prototype/prototype.module.css",
        "app/prototype/welcome/AccountPreview.tsx",
        "app/prototype/welcome/WelcomePanels.tsx",
        "app/prototype/welcome/WelcomePrototype.tsx",
        "app/prototype/welcome/page.tsx",
        "app/prototype/welcome/welcome.module.css"
      ],
      "tests": [
        "tests/holdings-prototype.test.tsx",
        "tests/holdings-prototype-route.test.tsx",
        "e2e/holdings-prototype.spec.ts",
        "tests/welcome-prototype.integration.test.tsx",
        "e2e/welcome-prototype.e2e.spec.ts",
        "tests/credit-prototype.test.ts",
        "tests/credit-prototype.integration.test.tsx",
        "e2e/credit-prototype.e2e.spec.ts",
        "tests/stock-chart.test.ts",
        "tests/stock-chart.integration.test.tsx",
        "e2e/stock-chart.e2e.spec.ts",
        "tests/profile-wallet.integration.test.tsx",
        "e2e/profile-wallet.e2e.spec.ts"
      ]
    },
    {
      "id": "delivery",
      "name": "Deployment configuration and database schema compatibility",
      "sources": [
        "next.config.mjs",
        "scripts/deployment-config.d.mts",
        "scripts/deployment-config.mjs",
        "scripts/migrate.mjs",
        "scripts/release-device-session-cap.sql",
        "scripts/validate-deployment.mjs",
        "server/database-types.ts",
        "server/local-test-database.ts"
      ],
      "tests": [
        "tests/deployment-preflight.test.ts",
        "tests/database-types.test.ts",
        "e2e/signin-update.spec.ts",
        "tests/local-test-database.test.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts"
      ]
    },
    {
      "id": "shell",
      "name": "App navigation, identity and screen orchestration",
      "sources": [
        "app/Drip.tsx",
        "app/favicon.ico",
        "app/globals.css",
        "app/layout.tsx",
        "app/page.tsx",
        "lib/identity.ts",
        "public/fonts/DM-Sans.ttf",
        "public/fonts/OFL-DM-Sans.txt"
      ],
      "tests": [
        "tests/ui.test.tsx",
        "tests/trusted-session.test.ts",
        "tests/identity.test.ts",
        "tests/signup-form.test.tsx",
        "e2e/smoke.spec.ts",
        "e2e/auth-screens.spec.ts",
        "e2e/gamertag-signin.spec.ts",
        "tests/saved-experience.integration.test.tsx",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/analytics-dashboard.integration.test.tsx",
        "tests/account-review.integration.test.tsx"
      ]
    },
    {
      "id": "governance",
      "name": "Regression catalog, change evidence and test-control guards",
      "sources": [
        ".github/workflows/ci.yml",
        ".github/workflows/pr-architecture-intelligence.yml",
        "package-lock.json",
        "package.json",
        "playwright.config.ts",
        "playwright.income.config.ts",
        "tools/regression/check.mjs",
        "tools/regression/policy.d.mts",
        "tools/regression/policy.mjs",
        "tools/regression/report.mjs",
        "tools/regression/playwright-summary.mjs",
        "tools/regression/playwright-summary.d.mts",
        "tools/regression/run.mjs",
        "vitest.calendar.config.mts",
        "vitest.config.mts",
        "vitest.unit-coverage.config.mts",
        "vitest.integration.config.mts",
        "tools/regression/cloud.mjs",
        "tools/regression/prepare-cloud.mjs",
        "playwright.cloud.config.ts",
        "playwright.webkit.config.ts",
        "tools/regression/browser-matrix.mjs",
        "tools/regression/browser-matrix.d.mts",
        "tools/regression/webkit.mjs"
      ],
      "tests": [
        "tests/regression-policy.test.ts",
        "tests/account-review.test.ts",
        "tests/local-test-database.test.ts"
      ]
    },
    {
      "id": "credit-prototype",
      "name": "Credit-card debt prototype and statement repayment planning",
      "sources": [
        "app/prototype/welcome/CreditCardPreview.tsx",
        "app/prototype/welcome/credit-card.ts"
      ],
      "tests": [
        "tests/credit-prototype.test.ts",
        "tests/credit-prototype.integration.test.tsx",
        "e2e/credit-prototype.e2e.spec.ts",
        "tests/profile-wallet.integration.test.tsx",
        "e2e/profile-wallet.e2e.spec.ts"
      ]
    },
    {
      "id": "stock-chart-prototype",
      "name": "Dividend-card chart auto-loading, ranges and recorded holding separation",
      "sources": [
        "app/prototype/welcome/StockPricePreview.tsx",
        "app/prototype/welcome/stock-chart.ts",
        "app/prototype/welcome/stock-price.module.css"
      ],
      "tests": [
        "tests/stock-chart.test.ts",
        "tests/stock-chart.integration.test.tsx",
        "e2e/stock-chart.e2e.spec.ts",
        "tests/profile-wallet.integration.test.tsx",
        "e2e/profile-wallet.e2e.spec.ts"
      ]
    },
    {
      "id": "stock-valuation-prototype",
      "name": "User-entered share-price valuation with dated FX and unchanged dividend income",
      "sources": [
        "app/prototype/welcome/StockValuePreview.tsx",
        "app/prototype/welcome/stock-valuation.ts"
      ],
      "tests": [
        "tests/stock-valuation.test.ts",
        "tests/stock-valuation.integration.test.tsx",
        "e2e/stock-valuation.e2e.spec.ts",
        "tests/profile-wallet.integration.test.tsx",
        "e2e/profile-wallet.e2e.spec.ts"
      ]
    },
    {
      "id": "feedback-prototype",
      "name": "Feedback experience and proposed C4 delivery architecture",
      "sources": [
        "app/prototype/feedback/page.tsx",
        "app/prototype/feedback/FeedbackPrototype.tsx",
        "app/prototype/feedback/FeedbackArchitecture.tsx",
        "app/prototype/feedback/FeedbackExperience.tsx",
        "app/prototype/feedback/FeedbackDialog.tsx",
        "app/prototype/feedback/feedback-model.ts",
        "app/prototype/feedback/feedback.module.css"
      ],
      "tests": [
        "tests/feedback-prototype.test.ts",
        "tests/feedback-prototype.integration.test.tsx",
        "e2e/feedback-prototype.e2e.spec.ts",
        "tests/holdings-prototype-route.test.tsx"
      ]
    },
    {
      "id": "profile-wallet-prototype",
      "name": "Profile settings entry and independent multiple-account prototype",
      "sources": [
        "app/prototype/welcome/ProfilePreview.tsx",
        "app/prototype/welcome/demo-accounts.ts"
      ],
      "tests": [
        "tests/profile-wallet.test.ts",
        "tests/profile-wallet.integration.test.tsx",
        "e2e/profile-wallet.e2e.spec.ts"
      ]
    },
    {
      "id": "saved-experience",
      "name": "Saved accounts, credit-card debts, profile preferences and explicit holding valuation",
      "sources": [
        "app/AccountChooser.tsx",
        "app/AccountChooser.module.css",
        "app/CreditCardForm.tsx",
        "app/CreditCardDetail.tsx",
        "app/accounts/AccountsHome.tsx",
        "app/accounts/AppAccountHeader.tsx",
        "app/accounts/ProfileSettings.tsx",
        "app/accounts/presentation.ts",
        "app/accounts/accounts.module.css",
        "app/stocks/StockPrice.tsx",
        "app/stocks/stock-price.module.css",
        "lib/credit-card.ts",
        "lib/money-storage.ts",
        "lib/market-valuation.ts",
        "lib/profile-preferences.ts",
        "lib/stock-chart.ts"
      ],
      "tests": [
        "tests/saved-experience.test.ts",
        "tests/saved-experience.integration.test.tsx",
        "tests/money-storage.test.ts",
        "integration/saved-experience-http.integration.test.ts",
        "e2e/saved-experience.e2e.spec.ts",
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts",
        "tests/stock-reading.integration.test.tsx",
        "e2e/stock-reading.e2e.spec.ts",
        "tests/payment-carousel.integration.test.tsx",
        "tests/account-review.integration.test.tsx"
      ]
    },
    {
      "id": "account-workflows",
      "name": "Safe actual balance dates, share reviews, draft protection, statement reminders and archived income",
      "sources": [
        "lib/account-lifecycle.ts",
        "app/useDraftGuard.tsx",
        "app/ArchivedAccounts.tsx"
      ],
      "tests": [
        "tests/account-workflows.test.ts",
        "tests/account-workflows.integration.test.tsx",
        "e2e/account-workflows.e2e.spec.ts"
      ]
    },
    {
      "id": "feedback-inbox",
      "name": "Private feedback submission and database triage",
      "sources": [
        "app/Feedback.tsx",
        "app/api/feedback/route.ts",
        "lib/feedback.ts",
        "server/feedback/api.ts",
        "server/feedback/store.ts",
        "scripts/feedback.sql",
        "app/feedback.module.css"
      ],
      "tests": [
        "tests/feedback.test.ts",
        "tests/feedback.integration.test.tsx",
        "integration/feedback-postgres.test.ts",
        "e2e/feedback.e2e.spec.ts",
        "tests/incidents.test.ts"
      ]
    },
    {
      "id": "stock-reading",
      "name": "Reading sources for dividend holdings",
      "sources": [
        "lib/stock-reading.ts",
        "app/stocks/StockReading.tsx",
        "app/stocks/stock-reading.module.css"
      ],
      "tests": [
        "tests/stock-reading.test.ts",
        "tests/stock-reading.integration.test.tsx",
        "e2e/stock-reading.e2e.spec.ts"
      ]
    },
    {
      "id": "analytics-dashboard",
      "name": "Private account analytics and payment carousels",
      "sources": [
        "app/AnalyticsDashboard.tsx",
        "app/AnalyticsDashboardCharts.tsx",
        "lib/analytics-dashboard.ts",
        "app/analytics-dashboard.module.css",
        "app/analytics-dashboard-charts.module.css"
      ],
      "tests": [
        "tests/analytics-dashboard.test.ts",
        "tests/analytics-dashboard.integration.test.tsx",
        "tests/payment-carousel.integration.test.tsx",
        "e2e/analytics-dashboard.e2e.spec.ts"
      ]
    },
    {
      "id": "account-review",
      "name": "User-confirmed review reminders for saved account figures",
      "sources": [
        "app/AccountReview.tsx",
        "lib/account-review.ts"
      ],
      "tests": [
        "tests/account-review.test.ts",
        "tests/account-review.integration.test.tsx",
        "tests/domain-boundaries.unit.test.ts",
        "e2e/account-review.e2e.spec.ts"
      ]
    },
    {
      "id": "incident-reporting",
      "name": "Privacy-safe API 5xx reporting and Slack alert delivery",
      "sources": [
        "server/incidents.ts"
      ],
      "tests": [
        "tests/incidents.test.ts",
        "tests/incident-api.integration.test.ts",
        "e2e/incident-boundary.spec.ts"
      ]
    }
  ],
  "layers": {
    "unit": [
      "tests/cloud-api.test.ts",
      "tests/incidents.test.ts",
      "tests/database-types.test.ts",
      "tests/device-sessions.test.ts",
      "tests/exchange-rates.test.ts",
      "tests/gaps.test.ts",
      "tests/identity.test.ts",
      "tests/income-reminders.test.ts",
      "tests/income.test.ts",
      "tests/lock.test.ts",
      "tests/maths-refactor.test.ts",
      "tests/maths.test.ts",
      "tests/money-storage.test.ts",
      "tests/payment-calendar.test.ts",
      "tests/recovery-api.test.ts",
      "tests/regression-policy.test.ts",
      "tests/topup.test.ts",
      "tests/local-test-database.test.ts",
      "tests/credit-prototype.test.ts",
      "tests/stock-chart.test.ts",
      "tests/stock-valuation.test.ts",
      "tests/feedback-prototype.test.ts",
      "tests/profile-wallet.test.ts",
      "tests/saved-experience.test.ts",
      "tests/account-workflows.test.ts",
      "tests/domain-boundaries.unit.test.ts",
      "tests/notification-boundaries.unit.test.ts",
      "tests/credential-validation.unit.test.ts",
      "tests/device-management.unit.test.ts",
      "tests/recovery-boundaries.unit.test.ts",
      "tests/cloud-sync.unit.test.ts",
      "tests/feedback.test.ts",
      "tests/stock-reading.test.ts",
      "tests/month-history.test.ts",
      "tests/analytics-dashboard.test.ts",
      "tests/account-review.test.ts"
    ],
    "integration": [
      "tests/account-options.test.tsx",
      "tests/cloud-sync-ui.test.tsx",
      "tests/cloud-ui.test.tsx",
      "tests/cloud.test.ts",
      "tests/crypto.test.ts",
      "tests/currency-estimate.test.tsx",
      "tests/daily.test.ts",
      "tests/db.test.ts",
      "tests/deployment-preflight.test.ts",
      "tests/device-management-client.test.ts",
      "tests/device-management-race.test.tsx",
      "tests/device-management-ui.test.tsx",
      "tests/incident-api.integration.test.ts",
      "tests/device-session-ui.test.tsx",
      "tests/device-session.test.ts",
      "tests/device-sessions-http.test.ts",
      "tests/holdings-prototype-route.test.tsx",
      "tests/holdings-prototype.test.tsx",
      "tests/income-notifications-ui.test.tsx",
      "tests/income-remove-ui.test.tsx",
      "tests/install-task.test.tsx",
      "tests/investment-format-compatibility.test.ts",
      "tests/local-vault-crypto.test.ts",
      "tests/local-vault.test.ts",
      "tests/notifications-security.test.ts",
      "tests/original-recovery-codes.test.ts",
      "tests/passkey-ui.test.tsx",
      "tests/passkey-unlock.test.ts",
      "tests/password-login.test.ts",
      "tests/password-server.test.ts",
      "tests/password-ui.test.tsx",
      "tests/payment-calendar.integration.test.tsx",
      "tests/phone-reminders.test.ts",
      "tests/products-ui.test.tsx",
      "tests/pwa-build.test.ts",
      "tests/pwa.test.tsx",
      "tests/recovery-autofill.test.tsx",
      "tests/recovery-code-readiness.test.ts",
      "tests/recovery-codes-ui.test.tsx",
      "tests/recovery-codes.test.ts",
      "tests/recovery-file.test.ts",
      "tests/recovery-input-ui.test.tsx",
      "tests/recovery-readiness.test.ts",
      "tests/recovery-task-ui.test.tsx",
      "tests/service-worker.test.ts",
      "tests/session-policy.test.ts",
      "tests/signup-form.test.tsx",
      "tests/signup-recovery-context.test.ts",
      "tests/signup-recovery-ui.test.tsx",
      "tests/signup-renewal-race.test.tsx",
      "tests/signup-replacement.test.ts",
      "tests/stock-investment-ui.test.tsx",
      "tests/stock-investment.test.ts",
      "tests/storage-validation.test.ts",
      "tests/trends-ui.test.tsx",
      "tests/trends.test.tsx",
      "tests/ui.test.tsx",
      "tests/upload-ack.test.ts",
      "tests/vault-ui.test.tsx",
      "tests/worker-safety.test.ts",
      "tests/welcome-prototype.integration.test.tsx",
      "tests/credit-prototype.integration.test.tsx",
      "tests/stock-chart.integration.test.tsx",
      "tests/stock-valuation.integration.test.tsx",
      "tests/feedback-prototype.integration.test.tsx",
      "tests/profile-wallet.integration.test.tsx",
      "tests/saved-experience.integration.test.tsx",
      "tests/account-workflows.integration.test.tsx",
      "tests/feedback.integration.test.tsx",
      "tests/stock-reading.integration.test.tsx",
      "tests/trusted-device.test.ts",
      "tests/trusted-session.test.ts",
      "tests/analytics-dashboard.integration.test.tsx",
      "tests/payment-carousel.integration.test.tsx",
      "tests/account-review.integration.test.tsx"
    ],
    "postgres": [
      "integration/account-http.integration.test.ts",
      "integration/device-management.test.ts",
      "integration/notification-rate-limits.test.ts",
      "integration/notifications-postgres.test.ts",
      "integration/saved-experience-http.integration.test.ts",
      "integration/feedback-postgres.test.ts"
    ],
    "browser": [
      "e2e/account-options.spec.ts",
      "e2e/account-wallet.spec.ts",
      "e2e/account-workflows.e2e.spec.ts",
      "e2e/auth-screens.spec.ts",
      "e2e/credit-prototype.e2e.spec.ts",
      "e2e/device-management.spec.ts",
      "e2e/exchange-rates.spec.ts",
      "e2e/feedback-prototype.e2e.spec.ts",
      "e2e/feedback.e2e.spec.ts",
      "e2e/four-device-signin.spec.ts",
      "e2e/gamertag-signin.spec.ts",
      "e2e/guided-recovery.spec.ts",
      "e2e/holdings-prototype.spec.ts",
      "e2e/income-notifications.spec.ts",
      "e2e/income-update.spec.ts",
      "e2e/install-task.spec.ts",
      "e2e/local-vault.spec.ts",
      "e2e/original-recovery.spec.ts",
      "e2e/passkey-unlock.spec.ts",
      "e2e/password-login.spec.ts",
      "e2e/password-race.spec.ts",
      "e2e/payment-calendar.e2e.spec.ts",
      "e2e/products.spec.ts",
      "e2e/profile-wallet.e2e.spec.ts",
      "e2e/pwa-current-update.e2e.spec.ts",
      "e2e/pwa-update.spec.ts",
      "e2e/rate-change.spec.ts",
      "e2e/recovery.spec.ts",
      "e2e/save-confidence.spec.ts",
      "e2e/saved-experience.e2e.spec.ts",
      "e2e/signin-update.spec.ts",
      "e2e/signup-errors.spec.ts",
      "e2e/smoke.spec.ts",
      "e2e/stock-chart.e2e.spec.ts",
      "e2e/stock-investment.spec.ts",
      "e2e/stock-reading.e2e.spec.ts",
      "e2e/stock-valuation.e2e.spec.ts",
      "e2e/welcome-prototype.e2e.spec.ts",
      "e2e/analytics-dashboard.e2e.spec.ts",
      "e2e/account-review.e2e.spec.ts",
      "e2e/incident-boundary.spec.ts"
    ]
  },
  "conditional": [
    {
      "file": "e2e/four-device-signin.spec.ts",
      "title": "four browsers restore the same account; a fifth is blocked; account switching preserves local data until consent",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/guided-recovery.spec.ts",
      "title": "password setup creates a verified passkey, which resets a forgotten password and restores the same cloud data",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/income-update.spec.ts",
      "title": "actual main worker3 upgrades to worker4 on a stable origin without changing encrypted accounts",
      "method": "skip",
      "reason": "Inherited conditional journey; requires coordinated old/new builds. Remains visible as unverified when not run; not counted as a passing test.",
      "fixture": "previous-build"
    },
    {
      "file": "e2e/password-login.spec.ts",
      "title": "existing encrypted accounts gain ordinary password sign-in, offline unlock, fresh-device access and recovery reset",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/password-login.spec.ts",
      "title": "signup saves the original recovery codes and offers the same set later with password confirmation",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/password-login.spec.ts",
      "title": "another account cannot claim an existing login gamertag",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/password-login.spec.ts",
      "title": "signed-out signup preserves a recoverable old account through cancellation, duplicate name and successful replacement",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/password-race.spec.ts",
      "title": "database-coordinated reset rejects overlapping password logins and sees sessions created while waiting",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/products.spec.ts",
      "title": "product and recorded income survive fresh-device encrypted cloud recovery",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/pwa-update.spec.ts",
      "title": "saved bookmark updates from the old worker, refreshes imported build identity, and retains encrypted accounts offline",
      "method": "skip",
      "reason": "Inherited conditional journey; requires coordinated old/new builds. Remains visible as unverified when not run; not counted as a passing test.",
      "fixture": "previous-build"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "cloud copy survives a fresh device, offline edits queue, and stale devices cannot overwrite it",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "cloud passkey verifies on the server, while new-device decryption still requires the code",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "downloaded set of six codes independently restores the same cloud account",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "offline sign-out keeps queued top-ups and online sign-out revokes the server session",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "an online cloud authentication outage does not block local unlock or queued top-ups",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/recovery.spec.ts",
      "title": "signed-out users can restore rampage201 instead of reopening the current profile",
      "method": "skip",
      "reason": "Requires the isolated local cloud fixture. Mandatory in the cloud browser stage; local-only skips are replaced only by actual passing cloud results.",
      "fixture": "local-cloud"
    },
    {
      "file": "e2e/signin-update.spec.ts",
      "title": "a saved password and encrypted records survive an old-to-new build update while signed out",
      "method": "skip",
      "reason": "Inherited conditional journey; requires coordinated old/new builds. Remains visible as unverified when not run; not counted as a passing test.",
      "fixture": "previous-build"
    }
  ]
}
