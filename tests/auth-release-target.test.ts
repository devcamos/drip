import { expect, it } from "vitest";
import { authTestTarget } from "../release/target";
import { verifiedPreview } from "../scripts/preview-deployment.mjs";
const origin = "https://drip-git-test-devonte-amos-projects.vercel.app";
const sha = "a".repeat(40);
const env = {
  DRIP_AUTH_VERIFIED_ORIGIN: origin, DRIP_AUTH_EXPECTED_SHA: sha,
  DRIP_AUTH_EXISTING_TAG: "gate_fixture", DRIP_AUTH_EXISTING_PASSWORD: "Synthetic secret 42!",
  DRIP_AUTH_EXISTING_BALANCE: "1234.56", VERCEL_AUTOMATION_BYPASS_SECRET: "synthetic-bypass",
};
const deployment = {
  projectId: "prj_oRnPShGUhLBdMD3dmk5F5SC6Nq9N", target: null, readyState: "READY",
  alias: [new URL(origin).hostname],
  meta: { githubOrg: "devcamos", githubRepo: "drip", githubCommitRef: "fix/test", githubCommitSha: sha },
};
it("accepts only a ready Preview at the exact reviewed source and owned alias", () => {
  expect(verifiedPreview(deployment, origin, sha, "fix/test")).toBe(true);
  expect(verifiedPreview({ ...deployment, readyState: "BUILDING" }, origin, sha, "fix/test")).toBe(false);
  expect(verifiedPreview(deployment, origin, "b".repeat(40), "fix/test")).toBe(false);
});
it.each([
  { projectId: "other-project" }, { target: "production" }, { target: undefined }, { alias: [] }, { customEnvironmentId: "custom" },
  { meta: { ...deployment.meta, githubRepo: "other" } },
  { meta: { ...deployment.meta, githubCommitRef: "main" } }, { readyState: "ERROR" },
])("rejects untrusted deployment metadata before giving the browser credentials (%#)", value => {
  expect(() => verifiedPreview({ ...deployment, ...value }, origin, sha, "fix/test")).toThrow();
});
it.each(["https://attacker.invalid", `${origin}/path`, `${origin}?token=x`, "http://localhost:4321", "https://u:p@drip.vercel.app"])("rejects an unverified origin (%#)", value => {
  expect(() => verifiedPreview(deployment, value, sha, "fix/test")).toThrow();
});
it("requires real-account fixtures and deployment protection access instead of skipping", () => {
  expect(authTestTarget(env).origin).toBe(origin);
  for (const key of ["DRIP_AUTH_EXISTING_TAG", "DRIP_AUTH_EXISTING_PASSWORD", "DRIP_AUTH_EXISTING_BALANCE", "DRIP_AUTH_EXPECTED_SHA", "VERCEL_AUTOMATION_BYPASS_SECRET"]) {
    expect(() => authTestTarget({ ...env, [key]: "" })).toThrow();
  }
});
it("allows explicit localhost verification without deployment credentials", () => {
  const local = { ...env, DRIP_AUTH_VERIFIED_ORIGIN: "http://localhost:4350", DRIP_AUTH_LOCAL_TEST: "true", VERCEL_AUTOMATION_BYPASS_SECRET: "" };
  expect(authTestTarget(local).local).toBe(true);
  expect(() => authTestTarget({ ...local, VERCEL_AUTOMATION_BYPASS_SECRET: "must-not-leak" })).toThrow();
  expect(() => authTestTarget({ ...local, DRIP_AUTH_LOCAL_TEST: "" })).toThrow();
});
