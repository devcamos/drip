import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import catalog from "./tools/regression/catalog.json" with { type: "json" };

const cloud = catalog.conditional.filter(item => item.fixture === "local-cloud");
const escape = (value: string) => RegExp.escape(value);
export default defineConfig({
  ...base,
  testMatch: [...new Set(cloud.map(item => item.file.slice(4)))],
  grep: new RegExp(cloud.map(item => escape(item.title)).join("|")),
  workers: 1, fullyParallel: false, retries: 0,
  webServer: { ...base.webServer, command: "npm run start -- --port 4321", url: "http://localhost:4321", reuseExistingServer: false },
});
