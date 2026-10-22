// npm links node_modules/.bin/depcruise to whichever package it reifies last,
// which is sometimes dependency-cruiser itself (no TypeScript 6). Point it at
// our wrapper so `node_modules/.bin/depcruise` always reads TypeScript sources.
import { existsSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

const binDir = join(process.cwd(), "node_modules", ".bin");
const target = join(import.meta.dirname, "bin", "depcruise.mjs");
if (existsSync(binDir)) {
  const link = join(binDir, "depcruise");
  rmSync(link, { force: true });
  symlinkSync(relative(binDir, target), link);
}
