import { parse } from "@babel/parser";

export const sourceFile = path => /^(app|lib|server|public|scripts)\//.test(path) ||
  /^tools\/regression\/.*\.(mjs|mts)$/.test(path) ||
  /^(next\.config\.mjs|vitest.*\.config\.mts|playwright.*\.config\.ts|package(?:-lock)?\.json|\.github\/workflows\/.*\.ya?ml)$/.test(path);
export const testFile = path => /^(tests|integration|e2e)\/.*\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

/** Read the actual application DDL without executing its deployment script. */
export function migrationStatements(source) {
  const ast = parse(source, { sourceType: "module" }), statements = [];
  for (const statement of ast.program.body) {
    if (statement.type !== "ExpressionStatement" || statement.expression.type !== "AwaitExpression") continue;
    const call = statement.expression.argument;
    if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.object.type !== "Identifier" || call.callee.object.name !== "db" || call.callee.property.type !== "Identifier" || call.callee.property.name !== "query") continue;
    const value = call.arguments[0];
    const sql = value?.type === "StringLiteral" ? value.value : value?.type === "TemplateLiteral" && !value.expressions.length ? value.quasis[0].value.cooked : null;
    if (!sql) throw new Error("Regression schema requires literal application migration SQL; do not omit changed statements.");
    statements.push(sql);
  }
  if (statements.length < 7) throw new Error("Application migration statements are missing; do not start a partial cloud fixture.");
  return statements;
}

/** Pure policy: callers supply repository snapshots, never credentials or I/O. */
export function validateCatalog(catalog, files) {
  const errors = [], known = new Set(files), owners = new Map(), suites = new Map();
  if (catalog.version !== 1 || !Array.isArray(catalog.features) || !catalog.features.length) return ["A nonempty version-1 feature catalog is required."];
  if (catalog.pyramidTarget && (catalog.pyramidTarget.unit !== 70 || catalog.pyramidTarget.integration !== 20 || catalog.pyramidTarget.browser !== 10)) errors.push("The test pyramid target must remain 70/20/10.");
  const ids = new Set();
  for (const feature of catalog.features) {
    if (!feature.id || ids.has(feature.id)) errors.push(`Duplicate/missing feature ID: ${feature.id}`);
    ids.add(feature.id);
    if (!feature.sources?.length || !feature.tests?.length) errors.push(`${feature.id}: source and regression evidence are required.`);
    for (const path of feature.sources ?? []) {
      if (!known.has(path)) errors.push(`${feature.id}: missing source ${path}`);
      if (owners.has(path)) errors.push(`Multiple feature owners for ${path}`);
      owners.set(path, feature.id);
    }
    for (const path of feature.tests ?? []) if (!known.has(path) || !testFile(path)) errors.push(`${feature.id}: missing/non-test evidence ${path}`);
  }
  for (const [layer, paths] of Object.entries(catalog.layers ?? {})) {
    if (!["unit", "integration", "postgres", "browser"].includes(layer)) errors.push(`Unknown test layer ${layer}`);
    for (const path of paths) {
      if (!known.has(path) || !testFile(path)) errors.push(`Missing/non-test layer entry ${path}`);
      if (suites.has(path)) errors.push(`Test assigned to multiple layers: ${path}`);
      suites.set(path, layer);
    }
  }
  for (const path of files) {
    if (sourceFile(path) && !owners.has(path)) errors.push(`Unmapped application source: ${path}`);
    if (testFile(path) && !suites.has(path)) errors.push(`Unclassified regression test: ${path}`);
  }
  for (const feature of catalog.features) for (const path of feature.tests ?? []) if (!suites.has(path)) errors.push(`${feature.id}: test has no executable layer: ${path}`);
  for (const path of suites.keys()) if (!catalog.features.some(feature => feature.tests?.includes(path))) errors.push(`Test has no feature coverage mapping: ${path}`);
  for (const pyramid of catalog.pyramids ?? []) {
    if (!ids.has(pyramid.featureId)) errors.push(`Pyramid has no feature: ${pyramid.featureId}`);
    for (const layer of ["unit", "integration", "browser"]) {
      if (!pyramid[layer]?.length) errors.push(`${pyramid.featureId}: pyramid needs ${layer} evidence.`);
      for (const path of pyramid[layer] ?? []) if (![layer, ...(layer === "integration" ? ["postgres"] : [])].includes(suites.get(path))) errors.push(`${pyramid.featureId}: incorrect ${layer} pyramid entry ${path}`);
    }
  }
  return errors;
}

/** Every affected feature needs a real changed/added test, even on deletion. */
export function validateChanges(catalog, changes, previous = catalog) {
  const tests = new Set(changes.filter(change => change.status !== "D" && testFile(change.path)).map(change => change.path));
  const errors = [];
  const affected = new Map();
  for (const change of changes) {
    if (!sourceFile(change.path)) continue;
    const feature = catalog.features.find(item => item.sources.includes(change.path)) ?? previous.features.find(item => item.sources.includes(change.path));
    if (!feature) { errors.push(`Changed application source has no feature: ${change.path}`); continue; }
    const current = catalog.features.find(item => item.id === feature.id);
    affected.set(feature.id, [...feature.tests, ...(current?.tests ?? [])]);
  }
  for (const [id, paths] of affected) if (!paths.some(path => tests.has(path))) errors.push(`${id}: add or update a mapped regression test with the application change.`);
  for (const feature of catalog.features) if (!previous.features.some(item => item.id === feature.id) && !catalog.pyramids?.some(pyramid => pyramid.featureId === feature.id)) errors.push(`${feature.id}: a new feature needs an executable unit/integration/browser pyramid.`);
  return errors;
}

function chain(expression) {
  if (expression?.type === "Identifier") return [expression.name];
  if (expression?.type === "MemberExpression") return [...chain(expression.object), expression.computed ? expression.property.value : expression.property.name];
  if (expression?.type === "CallExpression") return chain(expression.callee);
  return [];
}
/** AST scanning ignores comments/strings and catches .only/.skipIf/.todo too. */
export function inspectTests(source, file) {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const aliases = new Map(["it", "test", "describe", "suite"].map(name => [name, name]));
  const namespaces = new Set();
  for (const declaration of ast.program.body) if (declaration.type === "ImportDeclaration") {
    for (const specifier of declaration.specifiers) {
      if (specifier.type === "ImportSpecifier" && aliases.has(specifier.imported.name)) aliases.set(specifier.local.name, specifier.imported.name);
      if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
    }
  }
  const found = [];
  function visit(node, parentTitle = "<suite>") {
    let title = parentTitle;
    if (node.type === "CallExpression") {
      let parts = chain(node.callee);
      if (namespaces.has(parts[0])) parts = parts.slice(1);
      if (aliases.has(parts[0])) parts[0] = aliases.get(parts[0]);
      if (["it", "test", "describe", "suite"].includes(parts[0])) {
        const first = node.arguments[0];
        if (first?.type === "StringLiteral") title = first.value;
        if (first?.type === "TemplateLiteral" && !first.expressions.length) title = first.quasis[0].value.cooked;
        for (const method of ["only", "skip", "skipIf", "runIf", "todo", "fixme", "fails", "fail"]) {
          if (parts.includes(method)) found.push({ file, title, method });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visit(child, title);
      } else if (value?.type) visit(value, title);
    }
  }
  visit(ast);
  return [...new Map(found.map(item => [JSON.stringify(item), item])).values()];
}

export function validateTestControls(controls, conditional, previous) {
  const allowed = new Map(conditional.map(item => [`${item.file}\0${item.title}\0${item.method}`, item]));
  const errors = [];
  for (const item of controls) {
    const key = `${item.file}\0${item.title}\0${item.method}`;
    if (item.method === "only") errors.push(`Focused test is forbidden: ${item.file}: ${item.title}`);
    else if (!allowed.get(key)?.reason?.trim()) errors.push(`Unreviewed skipped/conditional test: ${item.file}: ${item.title} (${item.method})`);
  }
  for (const item of conditional) if (!controls.some(control => control.file === item.file && control.title === item.title && control.method === item.method)) errors.push(`Stale conditional-test record: ${item.file}: ${item.title}`);
  if (previous) for (const item of conditional) if (!previous.some(old => old.file === item.file && old.title === item.title && old.method === item.method)) errors.push(`Cannot add a conditional-test exemption: ${item.file}: ${item.title}`);
  return errors;
}

/** Local-only collection skips may be replaced only by an actually executed
 * cloud result. Every required cloud journey must run and pass independently.
 */
export function mergeBrowserResults(local, cloud, required) {
  const key = row => JSON.stringify([row.file, row.title]);
  const rows = new Map(local.map(row => [key(row), row])), errors = [];
  for (const row of cloud) {
    if (!required.some(item => key(item) === key(row))) errors.push(`Unexpected cloud journey: ${row.file}: ${row.title}`);
    const before = rows.get(key(row));
    rows.set(key(row), before?.status === "failed" || before?.flaky ? before : row);
  }
  for (const item of required) if (!cloud.some(row => key(row) === key(item) && row.status === "passed" && !row.flaky)) errors.push(`Required cloud journey did not pass: ${item.file}: ${item.title}`);
  return { records: [...rows.values()], errors };
}

/** Result records come from actual reporters. Missing/skipped suites cannot be
 * inferred green from exit codes, file counts or the number of assertions. */
export function summarizeResults(catalog, records) {
  const files = new Map(Object.entries(catalog.layers).flatMap(([layer, paths]) => paths.map(path => [path, layer])));
  const errors = [], counts = Object.fromEntries(["unit", "integration", "postgres", "browser"].map(layer => [layer, { passed: 0, failed: 0, skipped: 0 }]));
  for (const file of files.keys()) if (!records.some(record => record.file === file)) errors.push(`Suite did not execute: ${file}`);
  for (const record of records) {
    const layer = files.get(record.file);
    if (!layer) { errors.push(`Result has no catalog entry: ${record.file}`); continue; }
    if (!["passed", "failed", "skipped"].includes(record.status)) { errors.push(`Unknown result status: ${record.file}`); continue; }
    counts[layer][record.status]++;
    if (record.status === "failed" || record.flaky) errors.push(`Regression failed or was flaky: ${record.file}: ${record.title}`);
    if (record.status === "skipped" && !catalog.conditional.some(item => item.file === record.file && item.title === record.title)) errors.push(`Unreviewed runtime skip: ${record.file}: ${record.title}`);
  }
  const pyramids = (catalog.pyramids ?? []).map(pyramid => {
    const cases = Object.fromEntries(["unit", "integration", "browser"].map(layer => [layer, records.filter(record => pyramid[layer].includes(record.file))]));
    const total = Object.values(cases).reduce((sum, rows) => sum + rows.length, 0);
    const percentages = Object.fromEntries(Object.entries(cases).map(([layer, rows]) => [layer, total ? rows.length / total * 100 : 0]));
    for (const [layer, target] of Object.entries(catalog.pyramidTarget ?? { unit: 70, integration: 20, browser: 10 })) {
      if (!cases[layer]?.length || Math.abs(percentages[layer] - target) > 5 || cases[layer].some(row => row.status !== "passed")) errors.push(`${pyramid.featureId}: ${layer} is outside the 70/20/10 target (±5 percentage points) or did not pass.`);
    }
    return { featureId: pyramid.featureId, cases: Object.fromEntries(Object.entries(cases).map(([layer, rows]) => [layer, rows.length])), percentages };
  });
  const features = catalog.features.map(feature => {
    const rows = records.filter(record => feature.tests.includes(record.file));
    const missing = feature.tests.filter(file => !rows.some(row => row.file === file));
    const failed = rows.filter(row => row.status === "failed" || row.flaky).length, skipped = rows.filter(row => row.status === "skipped").length;
    return { id: feature.id, name: feature.name, passed: rows.filter(row => row.status === "passed").length, failed, skipped, missing, status: failed || missing.length ? "FAIL" : skipped ? "PARTIAL" : "PASS" };
  });
  return { counts, pyramids, features, conditional: records.filter(record => record.status === "skipped"), errors };
}
