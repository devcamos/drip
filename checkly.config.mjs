const env = (key, secret = false) => ({ key, value: process.env[key] ?? "", secret });

export default {
  projectName: "Drip Preview authentication",
  logicalId: "drip-preview-authentication",
  repoUrl: "https://github.com/devcamos/drip",
  checks: {
    playwrightConfigPath: "checkly.playwright.config.ts",
    browserChecks: {
      testMatch: "checks/preview-auth.spec.ts",
      frequency: 60,
      locations: ["us-east-1"],
      tags: ["drip", "preview", "authentication"],
      environmentVariables: [
        env("DRIP_PREVIEW_URL"),
        env("VERCEL_AUTOMATION_BYPASS_SECRET", true),
        env("DRIP_CHECKLY_GAMERTAG", true),
        env("DRIP_CHECKLY_PASSWORD", true),
        env("DRIP_CHECKLY_ACCOUNT_LABEL"),
        env("DRIP_CHECKLY_EXPECTED_BALANCE", true),
      ],
    },
  },
};
