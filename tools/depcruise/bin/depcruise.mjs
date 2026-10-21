#!/usr/bin/env node
// Runs dependency-cruiser with TypeScript 6. Drip is on TypeScript 7, which has
// no JavaScript compiler API, so dependency-cruiser would otherwise skip every
// .ts/.tsx file ("missing-tsc-transpiler") and report 0 modules.
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ts6 = {
  typescript: pathToFileURL(require.resolve("typescript")).href,
  "typescript/package.json": pathToFileURL(require.resolve("typescript/package.json")).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    // dependency-cruiser checks typescript/package.json for the version, then imports typescript.
    if (Object.hasOwn(ts6, specifier)) return { url: ts6[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

// dependency-cruiser does not export its CLI or package.json, so find its
// folder on the normal node_modules lookup path.
const dir = require.resolve.paths("dependency-cruiser")
  .map((base) => join(base, "dependency-cruiser"))
  .find((candidate) => existsSync(join(candidate, "bin", "dependency-cruiser.mjs")));
if (!dir) throw new Error("dependency-cruiser is not installed");
await import(pathToFileURL(join(dir, "bin", "dependency-cruiser.mjs")).href);
