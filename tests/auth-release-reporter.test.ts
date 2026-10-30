import { expect, it, vi } from "vitest";
import SafeReporter from "../release/safe-reporter";
import type { TestCase, TestResult } from "@playwright/test/reporter";
it("reports only static failure categories and checkpoints, hiding raw credentials and browser diagnostics", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const privateValue = "synthetic-private-cookie-and-password";
  const reporter = new SafeReporter();
  reporter.onTestEnd({ title: "synthetic test", annotations: [{ type: "checkpoint", description: "signup-submit" }, { type: "checkpoint", description: privateValue }] } as TestCase,
    { status: "failed", errors: [{ message: `TimeoutError: fill(${privateValue})`, stack: privateValue }], attachments: [{ body: Buffer.from(privateValue) }] } as unknown as TestResult);
  reporter.onError();
  const output = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
  expect(output).toContain("signup-submit");
  expect(output).toContain("TimeoutError");
  expect(output).not.toContain(privateValue);
});
