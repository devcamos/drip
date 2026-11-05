import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const shared = {
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" as const } },
};

// Keep pure logic out of the existing app-wide DOM/IndexedDB setup. Both layers
// remain in the normal coverage run as well; no existing quality gate changes.
export default defineConfig({
  test: {
    projects: [
      { ...shared, test: { name: "calendar-unit", environment: "node", include: ["tests/payment-calendar.test.ts"], testTimeout: 1000 } },
      { ...shared, test: { name: "calendar-integration", environment: "jsdom", include: ["tests/payment-calendar.integration.test.tsx"], setupFiles: ["tests/setup-dom.ts"], testTimeout: 10_000 } },
    ],
  },
});
