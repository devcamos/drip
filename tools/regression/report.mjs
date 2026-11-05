import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mergeBrowserResults, summarizeResults } from "./policy.mjs";

try {
  const catalog = JSON.parse(readFileSync("tools/regression/catalog.json", "utf8"));
  const vitest = JSON.parse(readFileSync("regression-results/vitest.json", "utf8"));
  const browser = JSON.parse(readFileSync("regression-results/browser.json", "utf8"));
  const cloud = existsSync("regression-results/browser-cloud.json") ? JSON.parse(readFileSync("regression-results/browser-cloud.json", "utf8")) : { suites: [], errors: [{ message: "Required local cloud reporter is missing." }] };
  if (!Array.isArray(vitest.testResults) || !Array.isArray(browser.suites) || !Array.isArray(cloud.suites)) throw new Error("Executed Vitest, browser and local cloud reporter results are required.");
  const records = [];
  const fileName = name => name.replaceAll("\\", "/").replace(resolve(".").replaceAll("\\", "/") + "/", "");
  for (const suite of vitest.testResults) {
    for (const row of suite.assertionResults ?? []) records.push({ file: fileName(suite.name), title: row.fullName ?? row.title, status: row.status === "passed" ? "passed" : row.status === "failed" ? "failed" : "skipped" });
  }
  function browserRecords(reporter) {
    const rows = [];
    function visit(suite) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests) {
        const last = test.results.at(-1);
        if (!last && !reporter.stats?.startTime) throw new Error("Browser collection output is not evidence of test execution.");
        const name = fileName(spec.file);
        rows.push({ file: name.startsWith("e2e/") ? name : "e2e/" + name, title: spec.title, status: last?.status === "passed" ? "passed" : last?.status === "skipped" ? "skipped" : "failed", flaky: test.status === "flaky", notRun: !last });
      }
      for (const child of suite.suites ?? []) visit(child);
    }
    for (const suite of reporter.suites) visit(suite);
    return rows;
  }
  const merged = mergeBrowserResults(browserRecords(browser), browserRecords(cloud), catalog.conditional.filter(item => item.fixture === "local-cloud"));
  records.push(...merged.records);
  const report = { generatedAt: new Date().toISOString(), target: "70/20/10 for new feature suites; legacy coverage retained and measured", ...summarizeResults(catalog, records) };
  report.errors.push(...merged.errors);
  if (!vitest.success || [browser, cloud].some(reporter => (reporter.errors?.length ?? 0) > 0 || (reporter.stats?.unexpected ?? 0) > 0)) report.errors.push("A test runner reported failure, missing evidence or an unhandled error.");
  mkdirSync("regression-results", { recursive: true });
  writeFileSync("regression-results/summary.json", JSON.stringify(report, null, 2) + "\n");
  const markdown = ["# Drip regression report", "", "Counts are executed test cases. Conditional/skipped journeys are unverified, not passes. Legacy distribution is reported honestly; new feature pyramids enforce the 70/20/10 target (±5 percentage points).", "", "| Layer | Passed | Failed | Conditional |", "| --- | ---: | ---: | ---: |", ...Object.entries(report.counts).map(([layer, counts]) => `| ${layer} | ${counts.passed} | ${counts.failed} | ${counts.skipped} |`), "", "| Feature | Result | Passed | Conditional |", "| --- | --- | ---: | ---: |", ...report.features.map(feature => `| ${feature.name} | ${feature.status} | ${feature.passed} | ${feature.skipped} |`), "", "## Conditional journeys", "", ...report.conditional.map(row => `- ${row.file}: ${row.title}`), "", "## Evidence errors", "", ...(report.errors.length ? report.errors.map(error => "- " + error) : ["None."]), ""].join("\n");
  writeFileSync("regression-results/summary.md", markdown);
  console.log(markdown);
  if (report.errors.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
