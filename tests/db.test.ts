import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import * as D from "../lib/db";

describe("db", () => {
  it("returns empty data then persists", async () => {
    expect(await D.loadData()).toEqual(D.emptyData());
    const d = { ...D.emptyData(), lastBackupAt: "2026-10-15" };
    await D.saveData(d);
    expect(await D.loadData()).toEqual(d);
    await D.setItem("k", 5);
    expect(await D.getItem("k")).toBe(5);
  });
  it("validates imported data", () => {
    expect(D.isAppData(D.emptyData())).toBe(true);
    expect(D.isAppData({ version: 2, accounts: [], snapshots: [] })).toBe(false);
    expect(D.isAppData({ version: 1, accounts: [{ id: 1 }], snapshots: [] })).toBe(false);
    expect(D.isAppData(null)).toBe(false);
  });
});
