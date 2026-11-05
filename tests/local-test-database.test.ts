import { expect, it } from "vitest";
import { localTestDatabase, regressionDatabaseURL } from "../server/local-test-database";
import { deploymentProblems } from "../scripts/deployment-config.mjs";

const database = "postgresql://drip_test@127.0.0.1:55438/drip_notifications_test";
const fixture = { DRIP_CLOUD_E2E: "1", DATABASE_URL: database, DRIP_TEST_DATABASE_URL: database, BETTER_AUTH_URL: "http://localhost:4321" };
it("leaves the existing deployment transport unchanged without explicit opt-in", () => {
  expect(localTestDatabase({ DATABASE_URL: "postgres://private-host/application", VERCEL: "1" })).toBeUndefined();
  expect(localTestDatabase({ ...fixture, DRIP_CLOUD_E2E: "0" })).toBeUndefined();
});
it("admits an explicit matching loopback test database and origin", () => expect(localTestDatabase(fixture)).toBe(database));
it("admits only the runner's generated browser schema option", () => {
  const value = database + "?options=" + encodeURIComponent("-c search_path=browser_" + "a".repeat(32));
  expect(regressionDatabaseURL(value, true).href).toBe(value);
  expect(() => regressionDatabaseURL(value)).toThrow();
});
it.each(["?host=remote.invalid", "?hostaddr=192.0.2.1", "?port=5432", "?options=-c%20search_path=public", "?options=-c%20search_path=browser_" + "a".repeat(32) + "&host=remote.invalid", "#other"])("rejects a local-looking connection override %s", suffix => {
  const value = database + suffix;
  expect(() => regressionDatabaseURL(value, true)).toThrow(/connection overrides/);
  expect(() => localTestDatabase({ ...fixture, DATABASE_URL: value, DRIP_TEST_DATABASE_URL: value })).toThrow();
});
it.each(["VERCEL", "VERCEL_ENV"])("rejects a deployment marker %s even with local-looking settings", key => expect(() => localTestDatabase({ ...fixture, [key]: "preview" })).toThrow(/deployment targets are forbidden/));
it("rejects mismatched test/application connections", () => expect(() => localTestDatabase({ ...fixture, DATABASE_URL: database + "?options=-csearch_path=other" })).toThrow());
it.each(["postgres://drip_test@db.example/drip_notifications_test", "postgres://drip_test@127.0.0.1/production", "https://127.0.0.1/drip_notifications_test", "invalid"])("rejects a non-test connection %s", value => expect(() => localTestDatabase({ ...fixture, DATABASE_URL: value, DRIP_TEST_DATABASE_URL: value })).toThrow());
it.each(["https://drip-one-xi.vercel.app", "http://localhost:4321/other", "http://user:password@localhost:4321", "invalid"])("rejects an inappropriate browser origin %s", value => expect(() => localTestDatabase({ ...fixture, BETTER_AUTH_URL: value })).toThrow());
it.each(["preview", "production"])("rejects local test mode during %s deployment preflight", VERCEL_ENV => {
  expect(deploymentProblems({ VERCEL_ENV, DRIP_CLOUD_E2E: "1", DATABASE_URL: "postgresql://synthetic@database.invalid/drip", BETTER_AUTH_URL: "https://drip.invalid", BETTER_AUTH_SECRET: "x".repeat(32) })).toContain("Local cloud-test mode must never be enabled on a Vercel deployment.");
});
