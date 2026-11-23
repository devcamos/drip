/** Exact, independently executed journeys. WebKit does not count twice in the pyramid. */
export const webkitJourneys = [
  { file: "auth-screens.spec.ts", title: "login, signup and recovery stay separate and support browser history" },
  { file: "account-workflows.e2e.spec.ts", title: "future transfers cannot change current money and unsaved edits survive cancelled navigation" },
  { file: "account-workflows.e2e.spec.ts", title: "stock position review, archive and restore preserve received dividends" },
  { file: "account-workflows.e2e.spec.ts", title: "credit-card reminders and calendar stay separate from income and paid statements survive reload" },
  { file: "payment-calendar.e2e.spec.ts", title: "an existing user views upcoming cash/dividend payments and opens the matching holding" },
  { file: "payment-calendar.e2e.spec.ts", title: "a user edits a payment schedule and the new calendar survives encrypted reload" },
  { file: "feedback.e2e.spec.ts", title: "a signed-in user can send a clearly disclosed feedback message and receive a reference" },
  { file: "stock-investment.spec.ts", title: "saves fractional shares and foreign prices, preserves them after encrypted reload, and updates return without logging income" },
  { file: "pwa-current-update.e2e.spec.ts", title: "the current installed shell accepts a new public fingerprint and preserves offline accounts and another open tab" },
  { file: "rate-change.spec.ts", title: "editing a rate with an effective date shows the rate history list" },
];

/** Fail closed on absent, skipped, flaky, wrong-project or duplicate evidence. */
export function validateBrowserMatrix(reporter, required = webkitJourneys) {
  const records = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      const last = test.results?.at(-1);
      records.push({ file: String(spec.file ?? "").replaceAll("\\", "/").split("/").at(-1), title: spec.title,
        project: test.projectName, passed: test.status === "expected" && last?.status === "passed" && test.results.length === 1 });
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  if (Array.isArray(reporter?.suites)) reporter.suites.forEach(visit);
  const errors = [];
  for (const journey of required) {
    const matches = records.filter(row => row.file === journey.file && row.title === journey.title && row.project === "mobile-webkit");
    if (matches.length !== 1 || !matches[0].passed) errors.push(`WebKit journey did not pass cleanly: ${journey.file}: ${journey.title}`);
  }
  if (records.length !== required.length || (reporter?.errors?.length ?? 0) > 0) errors.push("Unexpected, missing or failed WebKit browser evidence.");
  return { passed: records.filter(row => row.passed).length, required: required.length, errors };
}
