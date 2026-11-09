import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import catalog from "./tools/regression/catalog.json" with { type: "json" };

// Pure domain and validation modules. Infrastructure (storage, crypto, HTTP,
// authentication and browser APIs) is covered by the separate whole-app gate.
// Review this inventory whenever a business-logic module is added or moved.
const domain = [
  "account-colour", "account-lifecycle", "account-switch", "cloud-payload",
  "credit-card", "data-format", "decimal-input", "device-policy",
  "dividend-portfolio", "exchange-rates", "identity", "market-valuation",
  "maths", "payment-calendar", "payment-reminders", "products",
  "recovery-file", "stock-chart", "stock-investment",
].map(name => `lib/${name}.ts`);

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: catalog.layers.unit,
    setupFiles: ["tests/setup-unit.ts"],
    testTimeout: 1000,
    coverage: {
      include: [...domain, "server/notifications/model.ts"],
      reportsDirectory: "coverage/unit-domain",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});
