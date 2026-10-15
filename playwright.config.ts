import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4321", acceptDownloads: true, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"],
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {} } }],
  webServer: { command: "npx serve out -l 4321 --no-clipboard", url: "http://localhost:4321", reuseExistingServer: !process.env.CI },
});
