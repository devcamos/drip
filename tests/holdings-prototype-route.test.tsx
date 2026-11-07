import { afterEach, expect, test, vi } from "vitest";
import { isValidElement } from "react";
import PrototypePage from "../app/prototype/page";
import WelcomePrototypePage, { metadata as welcomeMetadata } from "../app/prototype/welcome/page";
import FeedbackPrototypePage, { metadata as feedbackMetadata } from "../app/prototype/feedback/page";

afterEach(() => vi.unstubAllEnvs());

test("sample holdings are unavailable on the Production deployment", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(() => PrototypePage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test.each(["preview", "development", undefined])("prototype remains available in %s", environment => {
  vi.stubEnv("VERCEL_ENV", environment);
  expect(isValidElement(PrototypePage())).toBe(true);
});

test("first-impression prototype is unavailable on the Production deployment", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(() => WelcomePrototypePage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(() => FeedbackPrototypePage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test.each(["preview", "development", undefined])("first-impression prototype remains available in %s", environment => {
  vi.stubEnv("VERCEL_ENV", environment);
  expect(isValidElement(WelcomePrototypePage())).toBe(true);
  expect(isValidElement(FeedbackPrototypePage())).toBe(true);
});

test("first-impression sample screens are excluded from search indexing", () => {
  expect(welcomeMetadata.robots).toEqual({ index: false, follow: false });
  expect(feedbackMetadata.robots).toEqual({ index: false, follow: false });
});
