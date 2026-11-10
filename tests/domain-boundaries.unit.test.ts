import { describe, expect, it } from "vitest";
import { accountCardStyle, normaliseColour } from "../lib/account-colour";
import { cloudPayload, fromCloudPayload } from "../lib/cloud-payload";
import { dataFormatVersion } from "../lib/data-format";
import { averagePriceLabel, formatShares, investmentInputs, investmentReturn, parseInvestment, validInvestment } from "../lib/stock-investment";
import { instrumentForHolding, stockChartDescriptor, validSharePriceInput } from "../lib/stock-chart";
import { allowedPushEndpoint, scheduleSchema } from "../server/notifications/model";
import { releaseData, releaseSaver, releaseStock } from "./saved-experience-fixtures";

const fields = { enabled: true, shares: "27.25750597", averagePriceGBP: "44.99", currency: "GBP" as const, originalPrice: "" };

describe("investment input and calculations", () => {
  it("preserves fractional shares, explicit zero and user-entered GBP cost", () => {
    expect(parseInvestment(fields)).toEqual({ shares: 27.25750597, averagePriceGBP: 44.99 });
    expect(parseInvestment({ ...fields, shares: "0", averagePriceGBP: "0" })).toEqual({ shares: 0, averagePriceGBP: 0 });
    expect(parseInvestment({ ...fields, enabled: false })).toBeUndefined();
  });
  it("rejects blank, negative, non-finite and non-decimal share or price inputs", () => {
    for (const bad of ["", " ", "-1", "Infinity", "NaN", "0x10", "0b10", "1e3", "+2", "1,000"]) {
      expect(parseInvestment({ ...fields, shares: bad }), `shares ${bad}`).toBeNull();
      expect(parseInvestment({ ...fields, averagePriceGBP: bad }), `price ${bad}`).toBeNull();
    }
  });
  it("requires and validates a foreign-currency price without guessing an exchange rate", () => {
    const usd = { ...fields, currency: "USD" as const, originalPrice: "60.41" };
    expect(parseInvestment(usd)).toEqual({ shares: 27.25750597, averagePriceGBP: 44.99, originalPrice: { currency: "USD", averagePrice: 60.41 } });
    for (const originalPrice of ["", "-1", "0x20", "1e2"]) expect(parseInvestment({ ...usd, originalPrice })).toBeNull();
    expect(investmentInputs(parseInvestment(usd)!)).toEqual(usd);
  });
  it("rejects malformed imported positions and unsafe multiplication", () => {
    for (const value of [null, [], {}, { shares: -1, averagePriceGBP: 1 }, { shares: 1, averagePriceGBP: Infinity }, { shares: 1e10, averagePriceGBP: 1e10 }, { shares: 1, averagePriceGBP: 1, originalPrice: { currency: "GBP", averagePrice: 1 } }]) expect(validInvestment(value)).toBe(false);
  });
  it("returns no fabricated gain percentage for zero cost or an unconfirmed position", () => {
    expect(investmentReturn({ balance: 25, investment: { shares: 2, averagePriceGBP: 0 } })).toEqual({ cost: 0, amount: 25, percent: null });
    expect(investmentReturn({ balance: 25, investment: { shares: 2, averagePriceGBP: 10 }, positionReviewRequired: true })).toBeNull();
    expect(investmentReturn({ balance: 25, investment: { shares: 2, averagePriceGBP: 10 } })).toEqual({ cost: 20, amount: 5, percent: 25 });
  });
  it("formats recorded share quantities and original-currency average prices", () => {
    expect(formatShares(27.25750597)).toBe("27.25750597");
    expect(averagePriceLabel({ shares: 1, averagePriceGBP: 44.99, originalPrice: { currency: "USD", averagePrice: 60.41 } })).toBe("US$60.41 (£44.99)");
    expect(averagePriceLabel({ shares: 1, averagePriceGBP: 10 })).toBe("£10.00");
  });
});

describe("financial sync and format boundaries", () => {
  it("removes local nicknames and unknown nested fields without changing the input", () => {
    const stock = releaseStock({ label: "private label", investment: { shares: 1, averagePriceGBP: 2, originalPrice: { currency: "USD", averagePrice: 3 } } });
    const input = releaseData([Object.assign(stock, { unexpected: "secret" })]);
    Object.assign(input.accounts[0].investment!, { privateNote: "hidden" });
    const snapshot = structuredClone(input); const result = cloudPayload(input);
    expect(JSON.stringify(result)).not.toMatch(/private label|unexpected|secret|privateNote|hidden/);
    expect(result.accounts[0].investment).toEqual({ shares: 1, averagePriceGBP: 2, originalPrice: { currency: "USD", averagePrice: 3 } });
    expect(input).toEqual(snapshot);
  });
  it("never imports old device nicknames or screen-lock settings from cloud", () => {
    const data = { ...releaseData([releaseSaver({ label: "old label" })]), lock: { credentialId: "local", enabledAt: "2026-01-01" } };
    const restored = fromCloudPayload(data); expect(restored.accounts[0].label).toBe(""); expect(restored).not.toHaveProperty("lock");
  });
  it("chooses the highest required format before older clients can overwrite new fields", () => {
    expect(dataFormatVersion({ accounts: [] })).toBe(1);
    expect(dataFormatVersion({ accounts: [{ investment: {} }] })).toBe(2);
    expect(dataFormatVersion({ accounts: [{ creditCard: {} }] })).toBe(3);
    expect(dataFormatVersion({ accounts: [{ investment: {} }, { archivedAt: "2026-10-01" }] })).toBe(4);
    expect(dataFormatVersion({ accounts: [{ positionReviewRequired: true }] })).toBe(4);
    expect(dataFormatVersion({ accounts: [{ creditCard: { statementPaid: true } }] })).toBe(4);
  });
});

describe("display and external boundaries", () => {
  it("normalises safe hex colours and rejects injected styles", () => {
    expect(normaliseColour("#AbC")).toBe("#aabbcc"); expect(normaliseColour("#0011FF")).toBe("#0011ff");
    for (const value of ["", "red", "#12", "#abc;display:none", null, 3]) expect(normaliseColour(value)).toBe("#b85a2a");
    expect(accountCardStyle("#000").color).toBe("#ffffff"); expect(accountCardStyle("#fff").color).toBe("#000000");
  });
  it("limits charts to known public instruments and supported ranges", () => {
    expect(instrumentForHolding("realty income")?.symbol).toBe("NYSE:O"); expect(instrumentForHolding("NYSE:DLR")?.name).toBe("Digital Realty");
    expect(instrumentForHolding("unknown")).toBeNull(); expect(stockChartDescriptor("https://evil.test", "3M")).toBeNull(); expect(stockChartDescriptor("realty-income", "ALL")).toBeNull();
    const url = new URL(stockChartDescriptor("realty-income", "1Y")!.iframeUrl); expect(url.hostname).toBe("www.tradingview-widget.com"); expect(JSON.parse(decodeURIComponent(url.hash.slice(1))).dateRanges).toEqual(["12m|1D"]);
  });
  it("accepts only positive decimal share prices within supported precision", () => {
    for (const value of ["0", "-1", "1e3", "0x10", "1.12345678901", "Infinity"]) expect(validSharePriceInput(value)).toBe(false);
    for (const value of [".01", "100", "1.1234567890"]) expect(validSharePriceInput(value)).toBe(true);
  });
  it("accepts browser push services but rejects credential, port and host tricks", () => {
    for (const value of ["https://fcm.googleapis.com/fcm/send/x", "https://web.push.apple.com/x", "https://updates.push.services.mozilla.com/x"]) expect(allowedPushEndpoint(value)).toBe(true);
    for (const value of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.test/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x", "https://127.0.0.1/x"]) expect(allowedPushEndpoint(value)).toBe(false);
  });
  it("rejects schedules with extra financial fields or invalid dates", () => {
    const plan = { timeZone: "Europe/London", plans: [{ anchor: "2026-11-30", frequency: "monthly" }] };
    expect(scheduleSchema.safeParse(plan).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...plan, balance: 100 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...plan, plans: [{ anchor: "2026-02-30", frequency: "monthly" }] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...plan, timeZone: "Not/AZone" }).success).toBe(false);
  });
});
