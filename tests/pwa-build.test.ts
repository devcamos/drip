import { expect, it, vi } from "vitest";

it("gives same-commit rebuilds distinct worker identities, stable within each build", async () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "synthetic-commit");
  const configPath = "../next.config.mjs";
  const inspect = async () => {
    vi.resetModules();
    const { default: config } = await import(configPath);
    return { build: await config.generateBuildId(), worker: config.env.NEXT_PUBLIC_DRIP_BUILD_ID };
  };
  try {
    const before = await inspect(), after = await inspect();
    expect(before.build).toBe(before.worker); expect(after.build).toBe(after.worker);
    expect(before.build).toMatch(/^synthetic-commit-/);
    expect(after.build).not.toBe(before.build);
  } finally { vi.unstubAllEnvs(); }
});
