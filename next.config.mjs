import { randomUUID } from "node:crypto";

// Public release fingerprint, never a credential. Imported service-worker code
// changes on every deployment/build even when its main script is unchanged.
const buildId = `${process.env.VERCEL_GIT_COMMIT_SHA || "local"}-${randomUUID()}`;
/** @type {import('next').NextConfig} */
export default {
  images: { unoptimized: true }, agentRules: false,
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_DRIP_BUILD_ID: buildId },
  async headers() {
    return ["/sw.js", "/sw-build.js"].map(source => ({ source, headers: [
      { key: "Cache-Control", value: "no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Vercel-CDN-Cache-Control", value: "no-store" },
    ] }));
  },
};
