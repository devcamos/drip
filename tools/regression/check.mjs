import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { inspectTests, testFile, validateCatalog, validateChanges, validateTestControls } from "./policy.mjs";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 8_000_000 });
  if (result.status !== 0) throw new Error("Could not read the requested Git comparison. Fetch the base commit; do not silently skip regression checks.");
  return result.stdout;
}
const catalogPath = "tools/regression/catalog.json";
try {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const files = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))];
  const errors = validateCatalog(catalog, files);
  const controls = files.filter(testFile).flatMap(file => inspectTests(readFileSync(file, "utf8"), file));
  let previousControls;
  const index = process.argv.indexOf("--base"), base = index < 0 ? undefined : process.argv[index + 1];
  if (index >= 0 && (!base || base.startsWith("--"))) throw new Error("--base needs a valid comparison commit.");
  if (base) {
    const sha = git(["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]).trim();
    const entries = git(["diff", "--name-status", "--no-renames", "-z", sha, "--"]).split("\0").filter(Boolean);
    const changes = [];
    for (let i = 0; i < entries.length; i += 2) changes.push({ status: entries[i], path: entries[i + 1] });
    // Include new local files so a developer can run the same check before staging.
    for (const path of git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) if (!changes.some(item => item.path === path)) changes.push({ status: "A", path });
    let previous = catalog;
    const show = spawnSync("git", ["show", `${sha}:${catalogPath}`], { encoding: "utf8" });
    if (show.status === 0) { previous = JSON.parse(show.stdout); previousControls = previous.conditional; }
    errors.push(...validateChanges(catalog, changes, previous));
  } else if (process.env.CI) throw new Error("CI must supply --base so changed-feature regression evidence is checked.");
  errors.push(...validateTestControls(controls, catalog.conditional, previousControls));
  if (errors.length) {
    console.error(errors.map(error => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else console.log(`Regression evidence OK: ${catalog.features.length} features; ${files.filter(testFile).length} suite files; ${catalog.conditional.length} inherited conditional journeys explicitly recorded.${base ? " Changed-feature evidence checked." : " Inventory only; use --base for change evidence."}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
