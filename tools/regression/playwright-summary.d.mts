export const defaultPlaywrightReport: string;
export interface PlaywrightCounts { passed: number; failed: number; flaky: number; skipped: number; total: number }
export interface PlaywrightReport { suites?: unknown[] }
export function summarizePlaywrightReport(report: PlaywrightReport): { files: PlaywrightCounts; tests: PlaywrightCounts };
export function formatCountLine(label: string, counts: PlaywrightCounts): string;
export function renderPlaywrightSummary(report: PlaywrightReport): string;
export function summaryFromFile(path?: string): string;
export function writePlaywrightSummary(path?: string, env?: NodeJS.ProcessEnv): string;
