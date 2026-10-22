/** Accept only hex colours; older empty/invalid values use the Nexus default. */
export function normaliseColour(value: unknown): string {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return "#b85a2a";
  const hex = value.slice(1).toLowerCase();
  return "#" + (hex.length === 3 ? [...hex].map(c => c + c).join("") : hex);
}

/** Choose readable text, then shade the gradient toward still-higher contrast. */
export function accountCardStyle(value: unknown) {
  const colour = normaliseColour(value);
  const rgb = [1, 3, 5].map(i => Number.parseInt(colour.slice(i, i + 2), 16));
  const linear = rgb.map(n => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  const lightText = 1.05 / (luminance + .05) >= (luminance + .05) / .05;
  const end = rgb.map(n => Math.round(lightText ? n * .75 : n + (255 - n) * .25));
  return { background: `linear-gradient(135deg, ${colour}, rgb(${end.join(", ")}))`, color: lightText ? "#ffffff" : "#000000" };
}
