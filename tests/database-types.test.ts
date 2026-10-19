import { expect, it } from "vitest";
import { databaseTypes } from "../server/database-types";

it("decodes Postgres bigint timestamps for bounded auth retry arithmetic without losing precision", () => {
  const lastRequest = databaseTypes.getTypeParser(20)("1792354873897");
  const retry = Math.ceil((lastRequest + 10_000 - 1792354873897) / 1000);
  expect(retry).toBe(10);
  expect(() => databaseTypes.getTypeParser(20)("9007199254740993")).toThrow(/safe range/);
  expect(databaseTypes.getTypeParser(23)("30")).toBe(30);
  expect(databaseTypes.getTypeParser(25)("unchanged")).toBe("unchanged");
});
