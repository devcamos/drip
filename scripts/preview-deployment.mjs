const project = "prj_oRnPShGUhLBdMD3dmk5F5SC6Nq9N";
export function verifiedPreview(deployment, origin, sha, branch) {
  let url;
  try { url = new URL(origin); } catch { throw new Error("Invalid Preview origin."); }
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".vercel.app")) throw new Error("Invalid Preview origin.");
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || !branch) throw new Error("Exact source commit and branch are required.");
  if ((deployment?.projectId ?? deployment?.project?.id) !== project || ![null, "preview"].includes(deployment?.target)) throw new Error("Deployment is not a Drip Preview.");
  if (deployment.customEnvironment || deployment.customEnvironmentId) throw new Error("Custom deployment environments require separate approval.");
  if (deployment?.meta?.githubOrg !== "devcamos" || deployment?.meta?.githubRepo !== "drip" || deployment?.meta?.githubCommitRef !== branch) throw new Error("Deployment repository or branch does not match the reviewed source.");
  if (!deployment.alias?.includes(url.hostname)) throw new Error("Deployment does not own the configured stable Preview alias.");
  if (["ERROR", "CANCELED", "CANCELLED"].includes(deployment.readyState)) throw new Error("Preview deployment failed.");
  return deployment.readyState === "READY" && deployment.meta.githubCommitSha === sha;
}
