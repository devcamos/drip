import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup-dom.ts"],
    testTimeout: 20_000,
    coverage: {
      include: ["lib/**", "app/**"],
      exclude: ["lib/types.ts", "**/*.css"],
      thresholds: {
        // whole app (UI included)
        lines: 85, functions: 85, branches: 85, statements: 85,
        // logic code keeps its stricter limits
        "lib/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
