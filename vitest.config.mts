import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import catalog from "./tools/regression/catalog.json" with { type: "json" };

const shared = {
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" as const } },
};

export default defineConfig({
  test: {
    projects: [
      { ...shared, test: { name: "unit", include: catalog.layers.unit, setupFiles: ["tests/setup-unit.ts"], testTimeout: 1000 } },
      { ...shared, test: { name: "integration", include: catalog.layers.integration, setupFiles: ["tests/setup-dom.ts"], testTimeout: 20_000 } },
      // Separate schemas share one ephemeral Postgres catalog. Serial file
      // lifecycle avoids DROP/CREATE racing Better Auth's catalog introspection.
      // Concurrent requests inside each test still exercise admission/lease races.
      { ...shared, test: { name: "postgres", include: catalog.layers.postgres, fileParallelism: false, testTimeout: 30_000 } },
    ],
    coverage: {
      include: ["lib/**", "app/**", "server/**", "scripts/deployment-config.mjs"],
      exclude: ["lib/types.ts", "**/*.css"],
      thresholds: {
        // whole app (UI included)
        lines: 90, functions: 90, branches: 90, statements: 90,
        // logic code keeps its stricter limits
        "lib/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
