// Synthetic, GBP-denominated design fixtures. Never read or write a user's vault.
export type Gradient = { name: string; start: string; end: string };
export type Holding = {
  id: string;
  name: string;
  ticker?: string;
  provider: string;
  kind: "stock" | "cash";
  value: number;
  yieldPct: number;
  shares: number;
  averagePrice: number;
  gradient: Gradient;
};

export const GRADIENTS: Gradient[] = [
  { name: "Copper", start: "#a8552f", end: "#47271f" },
  { name: "Forest", start: "#376e59", end: "#153c32" },
  { name: "Midnight", start: "#536b96", end: "#202e49" },
  { name: "Plum", start: "#855871", end: "#3b293d" },
  { name: "Lagoon", start: "#3a7479", end: "#1c3945" },
  { name: "Amber", start: "#9a7134", end: "#4c3622" },
];

export function demoHoldings(): Holding[] {
  return [
    { id: "realty", name: "Realty Income", ticker: "O", provider: "Trading 212", kind: "stock", value: 3680, shares: 80, averagePrice: 43.2, yieldPct: 5.6, gradient: { ...GRADIENTS[0] } },
    { id: "digital", name: "Digital Realty", ticker: "DLR", provider: "Trading 212", kind: "stock", value: 4200, shares: 35, averagePrice: 109, yieldPct: 3.6, gradient: { ...GRADIENTS[2] } },
    { id: "prologis", name: "Prologis", ticker: "PLD", provider: "Trading 212", kind: "stock", value: 4320, shares: 45, averagePrice: 86.4, yieldPct: 3.7, gradient: { ...GRADIENTS[3] } },
    { id: "zopa", name: "Zopa", provider: "Zopa", kind: "cash", value: 3000, shares: 0, averagePrice: 0, yieldPct: 4.3, gradient: { ...GRADIENTS[1] } },
  ];
}

export const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
export const annualIncome = (holding: Holding) => holding.value * holding.yieldPct / 100;

export function totals(holdings: Holding[]) {
  return holdings.reduce((sum, holding) => ({ value: sum.value + holding.value, income: sum.income + annualIncome(holding) }), { value: 0, income: 0 });
}

export function validateHolding(fields: Record<string, string>): string | null {
  const rules = [["value", 0, 1e12], ["yieldPct", 0, 100], ["shares", 0, 1e9], ["averagePrice", 0, 1e9]] as const;
  return rules.some(([key, min, max]) => fields[key].trim() === "" || !Number.isFinite(Number(fields[key])) || Number(fields[key]) < min || Number(fields[key]) > max)
    ? "Enter a valid amount in every field. Amounts cannot be negative and yield must be between 0 and 100%."
    : null;
}

export function gradientStyle(gradient: Gradient) {
  // Keep white labels readable across the blend, including pale custom colours.
  const shade = (hex: string) => {
    let rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const luminance = () => rgb.reduce((sum, channel, index) => {
      const value = channel / 255;
      return sum + [.2126, .7152, .0722][index] * (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    }, 0);
    while (luminance() > .17) rgb = rgb.map(channel => Math.floor(channel * .95));
    return `rgb(${rgb.join(", ")})`;
  };
  return { background: `linear-gradient(125deg, ${shade(gradient.start)}, ${shade(gradient.end)})` };
}
