import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { lockLocalVault } from "../lib/db";
import { clearDraft } from "../lib/draft";
import { cleanup } from "@testing-library/react";

afterEach(async () => {
  cleanup();
  lockLocalVault(true);
  await clearDraft();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (typeof window !== "undefined") window.history.replaceState(null, "", "/");
  // fresh IndexedDB per test
  await new Promise((r) => { const q = indexedDB.deleteDatabase("drip"); q.onsuccess = q.onerror = q.onblocked = () => r(null); });
});

if (typeof window !== "undefined") {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as any;
}

// jsdom has no native top-layer implementation; preserve dialog open/close
// semantics for component tests. Browser tests exercise real focus/inertness.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
}
