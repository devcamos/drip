/** Human-entered non-negative decimal values; conversion and range checks are separate. */
export function isDecimalInput(value: unknown): value is string {
  return typeof value === "string" && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim());
}

/** Preserve JavaScript's exact decimal representation without exponent notation. */
export function decimalInputValue(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [coefficient, exponentText] = text.split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const decimalPosition = whole.length + Number(exponentText);
  if (decimalPosition <= 0) return `0.${"0".repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return digits + "0".repeat(decimalPosition - digits.length);
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}
