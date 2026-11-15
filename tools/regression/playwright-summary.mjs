import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultPlaywrightReport = "regression-results/browser.json";

function testStatus(test) {
  if (test?.status === "flaky") return "flaky";
  if (test?.status === "skipped") return "skipped";
  if (test?.status === "unexpected") return "failed";
  if (test?.status === "expected") return "passed";
  const results = test?.results ?? [];
  const last = results.at(-1);
  if (!last) return "failed";
  if (last.status === "skipped") return "skipped";
  if (last.status === "passed") return results.some(result => result.status !== "passed" && result.status !== "skipped") ? "flaky" : "passed";
  return "failed";
}

function collectTests(report) {
  const files = new Map();
  function visit(suite, parentFile) {
    const file = suite.file || parentFile;
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file || file || "unknown";
      if (!files.has(specFile)) files.set(specFile, []);
      const tests = spec.tests ?? [];
      if (!tests.length) files.get(specFile).push("failed");
      for (const test of tests) files.get(specFile).push(testStatus(test));
    }
    for (const child of suite.suites ?? []) visit(child, file);
  }
  for (const suite of report?.suites ?? []) visit(suite);
  return files;
}

function fileStatus(statuses) {
  if (statuses.some(status => status === "failed")) return "failed";
  if (statuses.some(status => status === "flaky")) return "flaky";
  if (statuses.length && statuses.every(status => status === "skipped")) return "skipped";
  if (statuses.some(status => status === "passed")) return "passed";
  return "failed";
}

function emptyCounts() {
  return { passed: 0, failed: 0, flaky: 0, skipped: 0, total: 0 };
}

function increment(counts, status) {
  if (status === "passed") counts.passed += 1;
  else if (status === "failed") counts.failed += 1;
  else if (status === "flaky") counts.flaky += 1;
  else counts.skipped += 1;
  counts.total += 1;
}

export function summarizePlaywrightReport(report) {
  const files = emptyCounts();
  const tests = emptyCounts();
  for (const statuses of collectTests(report).values()) {
    increment(files, fileStatus(statuses));
    for (const status of statuses) increment(tests, status);
  }
  return { files, tests };
}

function noun(count, one, many) {
  return count === 1 ? one : many;
}

export function formatCountLine(label, counts) {
  const parts = [];
  if (counts.passed > 0 || (!counts.failed && !counts.flaky && !counts.skipped)) {
    parts.push(`✅ ${counts.passed} ${noun(counts.passed, "pass", "passes")}`);
  }
  if (counts.failed) parts.push(`❌ ${counts.failed} failed`);
  if (counts.flaky) parts.push(`⚠️ ${counts.flaky} flaky`);
  if (counts.skipped) parts.push(`⏭️ ${counts.skipped} skipped`);
  parts.push(`${counts.total} total`);
  return `${label}: ${parts.join(" · ")}`;
}

export function renderPlaywrightSummary(report) {
  const { files, tests } = summarizePlaywrightReport(report);
  return [
    formatCountLine("Playwright Spec Files", files),
    formatCountLine("Playwright Tests", tests),
  ].join("\n") + "\n";
}

export function summaryFromFile(path = defaultPlaywrightReport) {
  if (!existsSync(path)) return "Playwright JSON report not found.\n";
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(report.suites)) return "Playwright JSON report is invalid.\n";
  return renderPlaywrightSummary(report);
}

export function writePlaywrightSummary(path = process.argv[2] || defaultPlaywrightReport, env = process.env) {
  let text;
  try { text = summaryFromFile(path); }
  catch (error) { text = `Playwright summary failed: ${error.message}\n`; }
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) writePlaywrightSummary();
