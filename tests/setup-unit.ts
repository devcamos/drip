import { afterEach, beforeEach, vi } from "vitest";

// Pure/mocked-boundary tests get no IndexedDB, React or filesystem fixture.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
