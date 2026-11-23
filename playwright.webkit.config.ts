import { defineConfig, devices } from "@playwright/test";

// These critical journeys are executed separately from the Chromium pyramid.
// The iPhone profile is WebKit emulation, not a physical iOS/PWA test.
export default defineConfig({
  testDir: "e2e",
  testMatch: ["auth-screens.spec.ts", "account-workflows.e2e.spec.ts", "payment-calendar.e2e.spec.ts", "stock-investment.spec.ts", "feedback.e2e.spec.ts", "pwa-current-update.e2e.spec.ts", "rate-change.spec.ts"],
  timeout: 60_000,
  workers: 1,
  retries: 0,
  failOnFlakyTests: true,
  outputDir: "test-results/webkit",
  use: { baseURL: "http://localhost:4321", acceptDownloads: true, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "mobile-webkit", use: { ...devices["iPhone 13"] } }],
  // A developer's ignored .env.local must never turn this local suite into a
  // hosted-auth or production-data test.
  webServer: { command: "npm run start -- --port 4321", url: "http://localhost:4321", reuseExistingServer: false,
    env: { DATABASE_URL: "", BETTER_AUTH_SECRET: "", BETTER_AUTH_URL: "", DRIP_CLOUD_E2E: "", CRON_SECRET: "" } },
});
