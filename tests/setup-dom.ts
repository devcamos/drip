import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // fresh IndexedDB per test
  await new Promise((r) => { const q = indexedDB.deleteDatabase("drip"); q.onsuccess = q.onerror = q.onblocked = () => r(null); });
});

if (typeof window !== "undefined") {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as any;
}
