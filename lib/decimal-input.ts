/** Human-entered non-negative decimal values; conversion and range checks are separate. */
export function isDecimalInput(value: unknown): value is string {
  return typeof value === "string" && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim());
}
