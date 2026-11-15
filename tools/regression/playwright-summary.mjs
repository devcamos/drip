import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultPlaywrightReport = "regression-results/browser.json";
export const defaultCloudReport = "regression-results/browser-cloud.json";

const rank = { failed: 3, flaky: 2, passed: 1, skipped: 0 };

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

export function normalizeSpecFile(name = "") {
  let file = String(name).replaceAll("\\", "/");
  const prefix = resolve(".").replaceAll("\\", "/") + "/";
  if (file.startsWith(prefix)) file = file.slice(prefix.length);
  if (file && !file.startsWith("e2e/")) file = "e2e/" + file;
  return file;
}

function caseKey(file, title) {
  return JSON.stringify([normalizeSpecFile(file), title ?? ""]);
}

function mergeStatus(current, next) {
  if (!current) return next;
  if (!next) return current;
  return (rank[next] ?? 0) > (rank[current] ?? 0) ? next : current;
}

export function collectPlaywrightCases(report) {
  const cases = [];
  function visit(suite, parentFile) {
    const file = suite.file || parentFile;
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file || file || "unknown";
      const title = spec.title ?? "";
      const tests = spec.tests ?? [];
      if (!tests.length) cases.push({ file: normalizeSpecFile(specFile), title, status: "failed" });
      for (const test of tests) cases.push({ file: normalizeSpecFile(specFile), title, status: testStatus(test) });
    }
    for (const child of suite.suites ?? []) visit(child, file);
  }
  for (const suite of report?.suites ?? []) visit(suite);
  return cases;
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

function countsFromCases(cases) {
  const files = emptyCounts();
  const tests = emptyCounts();
  const byFile = new Map();
  for (const item of cases) {
    increment(tests, item.status);
    if (!byFile.has(item.file)) byFile.set(item.file, []);
    byFile.get(item.file).push(item.status);
  }
  for (const statuses of byFile.values()) increment(files, fileStatus(statuses));
  return { files, tests };
}

export function summarizePlaywrightReport(report) {
  return countsFromCases(collectPlaywrightCases(report));
}

export function mergePlaywrightCases(localCases, cloudCases = []) {
  const merged = new Map();
  for (const item of localCases) merged.set(caseKey(item.file, item.title), { file: normalizeSpecFile(item.file), title: item.title ?? "", status: item.status });
  for (const item of cloudCases) {
    const key = caseKey(item.file, item.title);
    const current = merged.get(key);
    merged.set(key, { file: normalizeSpecFile(item.file), title: item.title ?? "", status: mergeStatus(current?.status, item.status) });
  }
  return [...merged.values()];
}

export function summarizePlaywrightReports(local, cloud) {
  const localCases = collectPlaywrightCases(local);
  const cloudCases = cloud ? collectPlaywrightCases(cloud) : [];
  return {
    combined: countsFromCases(mergePlaywrightCases(localCases, cloudCases)),
    chromium: countsFromCases(localCases),
    cloud: cloud ? countsFromCases(cloudCases) : null,
  };
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

export function renderPlaywrightSummary(report, cloud) {
  if (cloud === undefined) {
    const { files, tests } = summarizePlaywrightReport(report);
    return [
      formatCountLine("Playwright Spec Files", files),
      formatCountLine("Playwright Tests", tests),
    ].join("\n") + "\n";
  }
  const summary = summarizePlaywrightReports(report, cloud);
  const lines = [
    formatCountLine("Playwright Spec Files", summary.combined.files),
    formatCountLine("Playwright Tests", summary.combined.tests),
    "",
    formatCountLine("Chromium Spec Files", summary.chromium.files),
    formatCountLine("Chromium Tests", summary.chromium.tests),
  ];
  if (summary.cloud) {
    lines.push(formatCountLine("Local cloud Spec Files", summary.cloud.files));
    lines.push(formatCountLine("Local cloud Tests", summary.cloud.tests));
  } else {
    lines.push("Local cloud report not found.");
  }
  return lines.join("\n") + "\n";
}

function readReport(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(report.suites)) throw new Error(`Playwright JSON report is invalid: ${path}`);
  return report;
}

export function summaryFromFile(path = defaultPlaywrightReport, cloudPath = defaultCloudReport) {
  if (!existsSync(path)) return "Playwright JSON report not found.\n";
  const local = readReport(path);
  if (cloudPath && existsSync(cloudPath)) return renderPlaywrightSummary(local, readReport(cloudPath));
  if (cloudPath) return renderPlaywrightSummary(local, null);
  return renderPlaywrightSummary(local);
}

export function writePlaywrightSummary(path = process.argv[2] || defaultPlaywrightReport, env = process.env, cloudPath = process.argv[3] || defaultCloudReport) {
  let text;
  try { text = summaryFromFile(path, cloudPath); }
  catch (error) { text = `Playwright summary failed: ${error.message}\n`; }
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) writePlaywrightSummary();
