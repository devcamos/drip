export function deploymentProblems(env) {
  const problems = [];
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
  for (const key of required) if (!env[key]?.trim()) problems.push(`${key} is missing.`);
  if (!["preview", "production"].includes(env.VERCEL_ENV ?? "")) problems.push("VERCEL_ENV must identify Preview or Production.");
  const local = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || local(url.hostname) || url.pathname.length < 2) throw new Error();
    } catch { problems.push("DATABASE_URL must identify a remote PostgreSQL database."); }
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim().length < 32) problems.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (env.BETTER_AUTH_URL?.trim()) {
    try {
      const url = new URL(env.BETTER_AUTH_URL);
      if (url.protocol !== "https:" || local(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
      const expected = env.VERCEL_ENV === "preview" ? env.VERCEL_BRANCH_URL : env.VERCEL_PROJECT_PRODUCTION_URL;
      // Vercel's branch URL is the stable auth/passkey origin; its unique
      // deployment URL changes on each build and must not replace that origin.
      if (expected && url.origin !== new URL(`https://${expected}`).origin) problems.push("BETTER_AUTH_URL does not match the stable Vercel origin for this target.");
    } catch { problems.push("BETTER_AUTH_URL must be an HTTPS origin without credentials, paths, queries or fragments."); }
  }
  return problems;
}
