import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { authBaseURL, deploymentProblems } from "../scripts/deployment-config.mjs";

const configured = {
  DATABASE_URL: "postgresql://synthetic:synthetic@database.invalid/drip",
  BETTER_AUTH_SECRET: "Synthetic-only-auth-deployment-secret-42!",
  BETTER_AUTH_URL: "https://drip-git-test-devonte-amos-projects.vercel.app",
  VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "drip-git-test-devonte-amos-projects.vercel.app",
};
function check(overrides: Record<string, string | undefined> = {}) {
  return deploymentProblems({ ...configured, ...overrides });
}
it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"])("rejects a deployed build with missing %s before compilation", key => {
  // Production has no branch-origin fallback, so every key is required there.
  const result = check({ [key]: "", VERCEL_ENV: "production" });
  expect(result.join("\n")).toContain(key);
  expect(result.join("\n")).not.toContain(configured.DATABASE_URL);
  expect(result.join("\n")).not.toContain(configured.BETTER_AUTH_SECRET);
});
it.each([
  { BETTER_AUTH_URL: "http://localhost:4321" },
  { BETTER_AUTH_URL: "https://user:password@drip.invalid" },
  { BETTER_AUTH_URL: "https://drip.invalid/api/auth" },
  { BETTER_AUTH_URL: "https://drip.invalid?token=private" },
  { BETTER_AUTH_URL: "https://drip.invalid/#private" },
  { BETTER_AUTH_URL: "not-a-url" },
  { DATABASE_URL: "https://database.invalid" },
  { DATABASE_URL: "postgresql://localhost/drip" },
  { BETTER_AUTH_SECRET: "short" },
  { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "another-host.invalid" },
])("rejects malformed or mismatched deployment settings without printing values (%#)", values => {
  // Production validates the configured auth URL; Preview derives it from Vercel.
  const result = check({ VERCEL_ENV: "production", ...values });
  expect(result.length).toBeGreaterThan(0);
  for (const value of Object.values(values)) expect(result.join("\n")).not.toContain(value);
});
it.each(["preview", "production"])("accepts valid %s settings", target => {
  const result = check({ VERCEL_ENV: target, VERCEL_PROJECT_PRODUCTION_URL: new URL(configured.BETTER_AUTH_URL).host });
  expect(result).toEqual([]);
});
it("requires the Vercel build to run the preflight before building", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.buildCommand).toMatch(/^npm run validate:deployment\s*&&\s*npm run build$/);
});
it("derives a missing Preview auth origin from the branch URL only", () => {
  expect(check({ BETTER_AUTH_URL: undefined })).toEqual([]);
  expect(authBaseURL({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: configured.VERCEL_BRANCH_URL })).toBe(configured.BETTER_AUTH_URL);
  expect(authBaseURL({ ...configured, VERCEL_ENV: "production", BETTER_AUTH_URL: " https://drip.invalid " })).toBe("https://drip.invalid");
  // A project-wide Preview value set for another branch never overrides this branch's origin.
  expect(authBaseURL({ ...configured, BETTER_AUTH_URL: "https://drip-git-other-devonte-amos-projects.vercel.app" })).toBe(configured.BETTER_AUTH_URL);
  expect(check({ BETTER_AUTH_URL: "https://drip-git-other-devonte-amos-projects.vercel.app" })).toEqual([]);
  expect(check({ BETTER_AUTH_URL: undefined, VERCEL_ENV: "production", VERCEL_BRANCH_URL: "drip.invalid" }).join("\n")).toContain("BETTER_AUTH_URL is missing");
  expect(check({ BETTER_AUTH_URL: undefined, VERCEL_BRANCH_URL: undefined }).join("\n")).toContain("BETTER_AUTH_URL is missing");
  expect(authBaseURL({ VERCEL_BRANCH_URL: "drip.invalid" })).toBeUndefined();
});
