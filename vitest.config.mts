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
      include: ["lib/**", "app/**", "server/**"],
      // Notification store/runtime and their thin route wrappers need Postgres and
      // web-push; they are covered by npm run test:integration instead.
      exclude: ["lib/types.ts", "**/*.css", "server/notifications/store.ts", "server/notifications/runtime.ts", "app/api/notifications/**"],
      thresholds: {
        // whole app (UI included)
        lines: 85, functions: 85, branches: 85, statements: 85,
        "app/**": { lines: 85, functions: 85, branches: 85, statements: 85 },
        "server/**": { lines: 85, functions: 85, branches: 85, statements: 85 },
        // logic code keeps its stricter limits
        "lib/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
