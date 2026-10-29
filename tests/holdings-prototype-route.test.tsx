import { afterEach, expect, test, vi } from "vitest";
import { isValidElement } from "react";
import PrototypePage from "../app/prototype/page";

afterEach(() => vi.unstubAllEnvs());

test("sample holdings are unavailable on the Production deployment", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(() => PrototypePage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test.each(["preview", "development", undefined])("prototype remains available in %s", environment => {
  vi.stubEnv("VERCEL_ENV", environment);
  expect(isValidElement(PrototypePage())).toBe(true);
});
