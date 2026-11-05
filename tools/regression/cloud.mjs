import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { regressionDatabaseURL } from "../../server/local-test-database.ts";

const value = process.env.DRIP_TEST_DATABASE_URL ?? "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test";
const url = regressionDatabaseURL(value);
if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error("Cloud regression accepts only a disposable loopback target outside deployment environments.");
const schema = "browser_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: value });
url.searchParams.set("options", `-c search_path=${schema}`);
const env = { ...process.env, DATABASE_URL: url.href, DRIP_TEST_DATABASE_URL: url.href, DRIP_CLOUD_E2E: "1", DRIP_E2E_SCHEMA: schema, BETTER_AUTH_URL: "http://localhost:4321", BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), PLAYWRIGHT_JSON_OUTPUT_FILE: "regression-results/browser-cloud.json" };
try {
  const prepare = spawnSync(process.execPath, ["tools/regression/prepare-cloud.mjs"], { env, stdio: "inherit" });
  if (prepare.error || prepare.status !== 0) process.exitCode = prepare.status || 1;
  else {
    const run = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.cloud.config.ts", "--reporter=list,json", ...process.argv.slice(2)], { env, stdio: "inherit" });
    if (run.error || run.status !== 0) process.exitCode = run.status || 1;
  }
} finally { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
