// Preview derives its stable branch origin; Production/local require an explicit URL.
export function authBaseURL(env) {
  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) return configured;
  const branch = env.VERCEL_ENV === "preview" ? env.VERCEL_BRANCH_URL?.trim() : "";
  return branch ? `https://${branch}` : undefined;
}
const local = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
function validDatabase(value) {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname && !local(url.hostname) && url.pathname.length >= 2;
  } catch { return false; }
}
function originProblems(value, expected) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || local(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Authentication URL must be a secure origin.");
    if (expected && url.origin !== new URL(`https://${expected}`).origin) return ["BETTER_AUTH_URL does not match the stable Vercel origin for this target."];
    return [];
  } catch { return ["BETTER_AUTH_URL must be an HTTPS origin without credentials, paths, queries or fragments."]; }
}
export function deploymentProblems(env) {
  const problems = [];
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET"]) if (!env[key]?.trim()) problems.push(`${key} is missing.`);
  const authURL = authBaseURL(env);
  if (!authURL) problems.push("BETTER_AUTH_URL is missing.");
  if (!["preview", "production"].includes(env.VERCEL_ENV ?? "")) problems.push("VERCEL_ENV must identify Preview or Production.");
  if (env.DATABASE_URL?.trim() && !validDatabase(env.DATABASE_URL)) problems.push("DATABASE_URL must identify a remote PostgreSQL database.");
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim().length < 32) problems.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
  const expected = env.VERCEL_ENV === "preview" ? env.VERCEL_BRANCH_URL : env.VERCEL_PROJECT_PRODUCTION_URL;
  if (authURL) problems.push(...originProblems(authURL, expected));
  return problems;
}
