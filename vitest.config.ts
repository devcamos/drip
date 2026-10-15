import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { include: ["lib/**"], thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 } },
  },
});
