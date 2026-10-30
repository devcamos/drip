import { appendFile } from "node:fs/promises";
import { verifiedPreview } from "./preview-deployment.mjs";
const env = process.env;
try {
  const origin = env.DRIP_AUTH_PREVIEW_ORIGIN;
  if (!origin || !env.VERCEL_TOKEN || !env.DRIP_AUTH_EXPECTED_SHA || !env.DRIP_AUTH_EXPECTED_BRANCH || !env.GITHUB_OUTPUT) throw new Error();
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") || url.username || url.password) throw new Error();
  // Only the approved Vercel API receives the read token. No redirect follows.
  const endpoint = `https://api.vercel.com/v13/deployments/${encodeURIComponent(url.hostname)}?teamId=team_BerIQ4WYo1yEEMYS1AmTXiIc`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    if (verifiedPreview(await response.json(), origin, env.DRIP_AUTH_EXPECTED_SHA, env.DRIP_AUTH_EXPECTED_BRANCH)) {
      await appendFile(env.GITHUB_OUTPUT, `origin=${origin}\nsha=${env.DRIP_AUTH_EXPECTED_SHA}\n`);
      console.log("Verified the ready Drip Preview, stable alias and exact reviewed source commit.");
      process.exit(0);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error();
} catch {
  console.error("Preview verification failed. Check the approved CI environment, read access, stable origin and exact deployment commit. No deployment credential was sent to the app.");
  process.exitCode = 1;
}
