import { describe, expect, it } from "vitest";
import appConfig from "../vitest.config.mjs";
import domainConfig from "../vitest.unit-coverage.config.mjs";
import { inspectTests, mergeBrowserResults, migrationStatements, sourceFile, summarizeResults, testFile, validateCatalog, validateChanges, validateTestControls, type Catalog, type TestResult } from "../tools/regression/policy.mjs";

const catalog = (): Catalog => ({ version: 1, features: [{ id: "cash", name: "Cash income", sources: ["lib/cash.ts"], tests: ["tests/cash.test.ts"] }], layers: { unit: ["tests/cash.test.ts"] }, conditional: [] });
const files = ["lib/cash.ts", "tests/cash.test.ts"];

describe("regression evidence guard", () => {
  it("keeps both domain-unit and combined app coverage gates at 90%", () => {
    for (const config of [domainConfig, appConfig]) {
      expect(config.test?.coverage?.thresholds).toMatchObject({ lines: 90, statements: 90, functions: 90, branches: 90 });
    }
    expect(domainConfig.test?.coverage?.include).toEqual(expect.arrayContaining(["lib/maths.ts", "lib/stock-investment.ts", "server/notifications/model.ts"]));
    expect(appConfig.test?.coverage?.include).toEqual(expect.arrayContaining(["app/**", "lib/**", "server/**"]));
  });
  it("replaces a local fixture skip with an actually passing cloud journey", () => {
    const required = [{ file: "e2e/account.spec.ts", title: "signup", method: "skip" }];
    const merged = mergeBrowserResults([{ file: required[0].file, title: "signup", status: "skipped" }], [{ file: required[0].file, title: "signup", status: "passed" }], required);
    expect(merged.errors).toEqual([]); expect(merged.records).toEqual([{ file: required[0].file, title: "signup", status: "passed" }]);
  });
  it("rejects absent, still-skipped and flaky cloud evidence", () => {
    const required = [{ file: "e2e/account.spec.ts", title: "signup", method: "skip" }];
    for (const cloud of [[], [{ file: required[0].file, title: "signup", status: "skipped" as const }], [{ file: required[0].file, title: "signup", status: "passed" as const, flaky: true }]]) expect(mergeBrowserResults([], cloud, required).errors).toHaveLength(1);
  });
  it("never hides a local regression with a later passing cloud result", () => {
    const row = { file: "e2e/account.spec.ts", title: "signup" };
    const result = mergeBrowserResults([{ ...row, status: "failed" }], [{ ...row, status: "passed" }], [{ ...row, method: "skip" }]);
    expect(result.records[0].status).toBe("failed");
  });
  it("loads every literal application migration query without executing the script", () => {
    const source = Array.from({ length: 7 }, (_, i) => `await db.query("SELECT ${i}");`).join("\n");
    expect(migrationStatements(source)).toEqual(Array.from({ length: 7 }, (_, i) => "SELECT " + i));
  });
  it("refuses partial or dynamic migration fixtures instead of omitting changed DDL", () => {
    expect(() => migrationStatements('await db.query("SELECT 1")')).toThrow(/missing/);
    expect(() => migrationStatements("await db.query(dynamicSQL)")).toThrow(/literal/);
  });
  it("accepts a mapped feature and an executable test", () => expect(validateCatalog(catalog(), files)).toEqual([]));
  it("fails for an untracked feature, missing test or unclassified suite", () => {
    expect(validateCatalog(catalog(), [...files, "app/NewFeature.tsx"])).toContain("Unmapped application source: app/NewFeature.tsx");
    expect(validateCatalog(catalog(), ["lib/cash.ts"])).toContain("cash: missing/non-test evidence tests/cash.test.ts");
    expect(validateCatalog(catalog(), [...files, "tests/new.test.ts"])).toContain("Unclassified regression test: tests/new.test.ts");
  });
  it("rejects duplicate ownership, duplicate layers and nonexistent suite references", () => {
    const c = catalog(); c.features.push({ ...c.features[0], id: "other" }); c.layers.integration = ["tests/cash.test.ts", "tests/missing.test.ts"];
    expect(validateCatalog(c, files)).toEqual(expect.arrayContaining(["Multiple feature owners for lib/cash.ts", "Test assigned to multiple layers: tests/cash.test.ts", "Missing/non-test layer entry tests/missing.test.ts"]));
  });
  it("requires regression evidence with each affected application's feature change", () => {
    expect(validateChanges(catalog(), [{ path: "lib/cash.ts", status: "M" }])).toEqual(["cash: add or update a mapped regression test with the application change."]);
    expect(validateChanges(catalog(), [{ path: "lib/cash.ts", status: "M" }, { path: "tests/cash.test.ts", status: "M" }])).toEqual([]);
  });
  it("does not mistake unrelated or deleted tests for regression evidence", () => {
    for (const change of [{ path: "tests/other.test.ts", status: "M" }, { path: "tests/cash.test.ts", status: "D" }]) expect(validateChanges(catalog(), [{ path: "lib/cash.ts", status: "M" }, change])).toHaveLength(1);
  });
  it("retains evidence requirements when deleting or moving an application module", () => {
    const current = catalog(); current.features[0].sources = ["lib/new-cash.ts"];
    expect(validateChanges(current, [{ path: "lib/cash.ts", status: "D" }], catalog())).toHaveLength(1);
    expect(validateChanges(current, [{ path: "lib/cash.ts", status: "D" }, { path: "lib/new-cash.ts", status: "A" }, { path: "tests/cash.test.ts", status: "M" }], catalog())).toEqual([]);
  });
  it("does not demand meaningless tests for documentation-only changes", () => {
    expect(validateChanges(catalog(), [{ path: "docs/help.md", status: "M" }])).toEqual([]);
    expect(sourceFile("public/sw.js")).toBe(true); expect(sourceFile("scripts/migrate.mjs")).toBe(true);
    expect(testFile("tests/cash.integration.test.tsx")).toBe(true); expect(testFile("e2e/cash.e2e.spec.ts")).toBe(true); expect(testFile("tests/fixtures.ts")).toBe(false);
  });
  it("parses TypeScript/JSX and ignores false positives in comments or strings", () => {
    expect(inspectTests('// test.only("ignored");\nconst label: string = "it.skip"; const view = <p>test.only</p>; it("real", () => {});', "tests/ui.test.tsx")).toEqual([]);
  });
  it("finds focused, skipped and conditional tests including computed and chained forms", () => {
    const controls = inspectTests('test("login", () => { test.skip(!process.env.DB, "needs DB"); }); it.only.each([1])("focused", () => {}); describe["skip"]("disabled", () => {}); it.skipIf(true)("conditional", () => {});', "tests/example.test.ts");
    expect(controls).toEqual(expect.arrayContaining([
      { file: "tests/example.test.ts", title: "login", method: "skip" },
      { file: "tests/example.test.ts", title: "focused", method: "only" },
      { file: "tests/example.test.ts", title: "disabled", method: "skip" },
      { file: "tests/example.test.ts", title: "conditional", method: "skipIf" },
    ]));
  });
  it("recognizes aliased and namespace imports when scanning test controls", () => {
    const controls = inspectTests('import { it as check } from "vitest"; import * as v from "vitest"; check.only("alias", () => {}); v.test.skip("namespace", () => {});', "tests/aliases.test.ts");
    expect(controls).toContainEqual({ file: "tests/aliases.test.ts", title: "alias", method: "only" });
    expect(controls).toContainEqual({ file: "tests/aliases.test.ts", title: "namespace", method: "skip" });
  });
  it("blocks new skip/expected-failure controls and never permits focus", () => {
    for (const method of ["skip", "todo", "fixme", "fails", "fail", "only"]) {
      const item = { file: "tests/cash.test.ts", title: "cash", method };
      expect(validateTestControls([item], [])).toHaveLength(1);
      if (method === "only") expect(validateTestControls([item], [{ ...item, reason: "cannot exempt focus" }])).toHaveLength(1);
    }
  });
  it("requires a reason for inherited conditional journeys and removes stale exceptions", () => {
    const item = { file: "e2e/upgrade.spec.ts", title: "old to new", method: "skip" };
    expect(validateTestControls([item], [{ ...item, reason: "Needs coordinated old/new builds; separately reported, not counted as passing." }])).toEqual([]);
    expect(validateTestControls([item], [{ ...item, reason: " " }])).toHaveLength(1);
    expect(validateTestControls([], [{ ...item, reason: "old" }])).toHaveLength(1);
    expect(validateTestControls([item], [{ ...item, reason: "invented new exception" }], [])).toEqual(["Cannot add a conditional-test exemption: e2e/upgrade.spec.ts: old to new"]);
  });
  it("requires a layered pyramid for a newly registered feature", () => {
    const previous = catalog(), next = catalog();
    next.features.push({ id: "new", name: "New", sources: ["lib/new.ts"], tests: ["tests/new.test.ts"] });
    expect(validateChanges(next, [], previous)).toEqual(["new: a new feature needs an executable unit/integration/browser pyramid."]);
  });
  it("rejects an incorrect layer in a feature pyramid or a weakened target", () => {
    const c = catalog(); c.pyramids = [{ featureId: "cash", unit: ["tests/cash.test.ts"], integration: ["tests/cash.test.ts"], browser: [] }];
    c.pyramidTarget = { unit: 90, integration: 5, browser: 5 };
    expect(validateCatalog(c, files)).toEqual(expect.arrayContaining(["The test pyramid target must remain 70/20/10.", "cash: incorrect integration pyramid entry tests/cash.test.ts", "cash: pyramid needs browser evidence."]));
  });
  it("never reports an empty/missing suite as verified", () => {
    expect(summarizeResults(catalog(), []).errors).toEqual(["Suite did not execute: tests/cash.test.ts"]);
    expect(summarizeResults(catalog(), []).features[0].status).toBe("FAIL");
  });
  it("keeps inherited skipped journeys visible as partial evidence", () => {
    const c = catalog(); c.layers.browser = ["e2e/cash.spec.ts"]; c.features[0].tests.push("e2e/cash.spec.ts");
    c.conditional = [{ file: "e2e/cash.spec.ts", title: "cloud", method: "skip", reason: "isolated hosted fixture" }];
    const report = summarizeResults(c, [{ file: "tests/cash.test.ts", title: "calculation", status: "passed" }, { file: "e2e/cash.spec.ts", title: "cloud", status: "skipped" }]);
    expect(report.counts.browser).toEqual({ passed: 0, failed: 0, skipped: 1 });
    expect(report.features[0].status).toBe("PARTIAL"); expect(report.errors).toEqual([]);
  });
  it("fails on unreviewed runtime skips and retries that only pass after a failure", () => {
    for (const result of [{ status: "skipped" as const }, { status: "passed" as const, flaky: true }, { status: "failed" as const }]) {
      expect(summarizeResults(catalog(), [{ file: "tests/cash.test.ts", title: "calculation", ...result }]).errors).toHaveLength(1);
    }
  });
  it("measures the new-feature pyramid from executed cases and blocks ratio drift", () => {
    const c = catalog(); c.layers.integration = ["tests/cash.integration.test.ts"]; c.layers.browser = ["e2e/cash.spec.ts"];
    c.features[0].tests.push("tests/cash.integration.test.ts", "e2e/cash.spec.ts");
    c.pyramids = [{ featureId: "cash", unit: ["tests/cash.test.ts"], integration: ["tests/cash.integration.test.ts"], browser: ["e2e/cash.spec.ts"] }];
    const cases = (file: string, count: number): TestResult[] => Array.from({ length: count }, (_, index) => ({ file, title: "case " + index, status: "passed" }));
    const good = [...cases("tests/cash.test.ts", 7), ...cases("tests/cash.integration.test.ts", 2), ...cases("e2e/cash.spec.ts", 1)];
    expect(summarizeResults(c, good).errors).toEqual([]);
    const drift = [...cases("tests/cash.test.ts", 1), ...cases("tests/cash.integration.test.ts", 2), ...cases("e2e/cash.spec.ts", 7)];
    expect(summarizeResults(c, drift).errors.length).toBeGreaterThan(0);
  });
});
