import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { validateBrowserMatrix } from "./browser-matrix.mjs";

const output = "regression-results/browser-webkit.json";
const run = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.webkit.config.ts", "--reporter=list,json"], {
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: output }, stdio: "inherit",
});
let summary;
try { summary = validateBrowserMatrix(JSON.parse(readFileSync(output, "utf8"))); }
catch { summary = { passed: 0, required: 4, errors: ["WebKit browser evidence is missing or invalid."] }; }
writeFileSync("regression-results/browser-matrix-summary.json", JSON.stringify({ project: "mobile-webkit", ...summary }, null, 2) + "\n");
if (run.error || run.status !== 0 || summary.errors.length) {
  console.error(summary.errors.join("\n") || "WebKit browser runner failed.");
  process.exitCode = run.status || 1;
}
