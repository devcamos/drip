// Preview builds may omit BETTER_AUTH_URL: each branch then uses its own stable
// Vercel branch origin, so one project-wide Preview value cannot mismatch other branches.
// Production and local runs still need it set explicitly.
export function authBaseURL(env) {
  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) return configured;
  const branch = env.VERCEL_ENV === "preview" ? env.VERCEL_BRANCH_URL?.trim() : "";
  return branch ? `https://${branch}` : undefined;
}

export function deploymentProblems(env) {
  const problems = [];
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET"]) if (!env[key]?.trim()) problems.push(`${key} is missing.`);
  const authURL = authBaseURL(env);
  if (!authURL) problems.push("BETTER_AUTH_URL is missing.");
  if (!["preview", "production"].includes(env.VERCEL_ENV ?? "")) problems.push("VERCEL_ENV must identify Preview or Production.");
  const local = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || local(url.hostname) || url.pathname.length < 2) throw new Error();
    } catch { problems.push("DATABASE_URL must identify a remote PostgreSQL database."); }
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim().length < 32) problems.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (authURL) {
    try {
      const url = new URL(authURL);
      if (url.protocol !== "https:" || local(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
      const expected = env.VERCEL_ENV === "preview" ? env.VERCEL_BRANCH_URL : env.VERCEL_PROJECT_PRODUCTION_URL;
      // Vercel's branch URL is the stable auth/passkey origin; its unique
      // deployment URL changes on each build and must not replace that origin.
      if (expected && url.origin !== new URL(`https://${expected}`).origin) problems.push("BETTER_AUTH_URL does not match the stable Vercel origin for this target.");
    } catch { problems.push("BETTER_AUTH_URL must be an HTTPS origin without credentials, paths, queries or fragments."); }
  }
  return problems;
}
