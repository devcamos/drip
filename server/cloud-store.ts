export const MAX_CLOUD_BYTES = 2_000_000;
export interface CloudEnvelope { app: "drip-cloud"; v: 1; iv: string; ct: string }
export function isCloudEnvelope(value: unknown): value is CloudEnvelope {
  if (!value || typeof value !== "object") return false;
  const e = value as CloudEnvelope;
  return e.app === "drip-cloud" && e.v === 1 && typeof e.iv === "string" && /^[A-Za-z0-9+/]{16}$/.test(e.iv)
    && typeof e.ct === "string" && e.ct.length >= 24 && e.ct.length <= MAX_CLOUD_BYTES && /^[A-Za-z0-9+/]+={0,2}$/.test(e.ct);
}
