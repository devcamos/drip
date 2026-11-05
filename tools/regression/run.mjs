import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { regressionDatabaseURL } from "../../server/local-test-database.ts";

// The comprehensive suite can touch only the known disposable loopback DB.
const database = process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test";
regressionDatabaseURL(database);
if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error("Run the regression fixture outside deployment environments.");
const base = process.env.REGRESSION_BASE ?? (process.env.CI ? undefined : "origin/main");
if (!base) throw new Error("CI must specify its exact regression comparison commit.");
mkdirSync("regression-results", { recursive: true });
for (const name of ["vitest.json", "browser.json", "browser-cloud.json", "summary.json", "summary.md", "failure.json"]) rmSync("regression-results/" + name, { force: true });
const env = { ...process.env, DRIP_TEST_DATABASE_URL: database, PLAYWRIGHT_JSON_OUTPUT_FILE: "regression-results/browser.json" };
// Next's browser fixture is deliberately local-only. Real account HTTP/SQL
// contracts configure their own disposable connection inside Vitest.
// Empty definitions also prevent Next's dotenv loader from repopulating these
// values from an ignored local .env file after the child process starts.
for (const key of new Set([...Object.keys(env), "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DRIP_CLOUD_E2E", "CRON_SECRET"])) if (["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DRIP_CLOUD_E2E", "CRON_SECRET"].includes(key) || key.startsWith("DRIP_PUSH_")) env[key] = "";
const stages = [
  [process.execPath, ["tools/regression/check.mjs", "--base", base]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "depcruise"]],
  [process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--coverage", "--reporter=default", "--reporter=json", "--outputFile.json=regression-results/vitest.json"]],
  ["npm", ["run", "build"]],
  [process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--reporter=list,json"]],
  [process.execPath, ["tools/regression/cloud.mjs"]],
  [process.execPath, ["tools/regression/report.mjs"]],
];
for (const [command, args] of stages) {
  console.log(`\nRegression stage: ${args.slice(0, 2).join(" ")}`);
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    writeFileSync("regression-results/failure.json", JSON.stringify({ stage: args.slice(0, 2).join(" "), exitCode: result.status, at: new Date().toISOString(), complete: false }, null, 2) + "\n");
    if (args[0] !== "tools/regression/report.mjs" && existsSync("regression-results/vitest.json") && existsSync("regression-results/browser.json")) spawnSync(process.execPath, ["tools/regression/report.mjs"], { env, stdio: "inherit" });
    console.error("Regression verification stopped at the failed stage; see regression-results/failure.json."); process.exit(result.status || 1);
  }
}
