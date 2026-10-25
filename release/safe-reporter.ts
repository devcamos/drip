import type { Reporter, TestCase, TestResult, FullResult } from "@playwright/test/reporter";
// Browser failures can contain fill values, cookies, request bodies and DOM
// snapshots. Publish only static test titles/status, never errors or attachments.
export default class SafeReporter implements Reporter {
  onTestBegin(test: TestCase) { console.log(`Auth verification started: ${test.title}`); }
  onTestEnd(test: TestCase, result: TestResult) {
    console.log(`Auth verification: ${test.title} — ${result.status}`);
    if (result.status !== "passed") {
      const allowed = new Set(["readiness", "existing-login", "signup", "signup-submit", "signup-accounts", "cloud-save", "sign-out", "fresh-device-restore"]);
      const stage = test.annotations.filter(note => note.type === "checkpoint" && allowed.has(note.description ?? "")).at(-1)?.description;
      console.error(`Auth verification failed at: ${stage ?? "setup"}`);
      const categories = ["toHaveClass", "toBeVisible", "strict mode violation", "TimeoutError", "toBeTruthy", "toContainText", "toContain", "toBe"];
      const category = categories.find(value => result.errors.some(error => error.message?.includes(value)));
      console.error(`Auth verification failure category: ${category ?? "request or browser failure"}`);
    }
  }
  onError() { console.error("Auth verification could not complete. Check protected configuration and the approved deployment."); }
  onEnd(result: FullResult) { console.log(`Auth verification result: ${result.status}`); }
}
