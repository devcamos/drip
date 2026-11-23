import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./checks",
  testMatch: "preview-auth.spec.ts",
  fullyParallel: false,
  timeout: 90_000,
  retries: 0,
  use: {
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
