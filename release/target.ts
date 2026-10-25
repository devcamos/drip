export function authTestTarget(env: Record<string, string | undefined> = process.env) {
  const origin = env.DRIP_AUTH_VERIFIED_ORIGIN;
  const sha = env.DRIP_AUTH_EXPECTED_SHA;
  if (!origin || !sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("Verified deployment origin and exact commit are required.");
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("Invalid verified deployment origin."); }
  const local = env.DRIP_AUTH_LOCAL_TEST === "true" && url.hostname === "localhost" && url.protocol === "http:";
  if (url.origin !== origin || url.username || url.password || (!local && (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")))) throw new Error("Use a verified HTTPS Vercel origin or an explicitly enabled localhost test.");
  if (local && env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error("Never send deployment credentials to localhost.");
  if (!env.DRIP_AUTH_EXISTING_TAG || !env.DRIP_AUTH_EXISTING_PASSWORD || !/^\d+(?:\.\d{1,2})?$/.test(env.DRIP_AUTH_EXISTING_BALANCE ?? "")) throw new Error("A dedicated existing synthetic account and its expected balance are required.");
  if (!local && !env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error("Protected Preview automation access is not configured.");
  return { origin, sha, local };
}
