import { defineConfig, devices } from "@playwright/test";
import { authTestTarget } from "./target";
const target = authTestTarget();
export default defineConfig({
  testDir: ".", testMatch: "auth.spec.ts", fullyParallel: false, workers: 1,
  retries: 0, timeout: 180_000, reporter: [["./safe-reporter.ts"]],
  use: {
    baseURL: target.origin, ...devices["Pixel 7"],
    trace: "off", screenshot: "off", video: "off", serviceWorkers: "block",
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
});
