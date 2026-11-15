export const defaultPlaywrightReport: string;
export const defaultCloudReport: string;
export interface PlaywrightCounts { passed: number; failed: number; flaky: number; skipped: number; total: number }
export interface PlaywrightReport { suites?: unknown[] }
export interface PlaywrightCase { file: string; title: string; status: "passed" | "failed" | "flaky" | "skipped" }
export function normalizeSpecFile(name?: string): string;
export function collectPlaywrightCases(report: PlaywrightReport): PlaywrightCase[];
export function summarizePlaywrightReport(report: PlaywrightReport): { files: PlaywrightCounts; tests: PlaywrightCounts };
export function mergePlaywrightCases(localCases: PlaywrightCase[], cloudCases?: PlaywrightCase[]): PlaywrightCase[];
export function summarizePlaywrightReports(local: PlaywrightReport, cloud?: PlaywrightReport | null): {
  combined: { files: PlaywrightCounts; tests: PlaywrightCounts };
  chromium: { files: PlaywrightCounts; tests: PlaywrightCounts };
  cloud: { files: PlaywrightCounts; tests: PlaywrightCounts } | null;
};
export function formatCountLine(label: string, counts: PlaywrightCounts): string;
export function renderPlaywrightSummary(report: PlaywrightReport, cloud?: PlaywrightReport | null): string;
export function summaryFromFile(path?: string, cloudPath?: string): string;
export function writePlaywrightSummary(path?: string, env?: NodeJS.ProcessEnv, cloudPath?: string): string;
