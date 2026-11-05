export interface Feature { id: string; name: string; sources: string[]; tests: string[] }
export interface ConditionalTest { file: string; title: string; method: string; reason?: string; fixture?: string }
export interface Pyramid { featureId: string; unit: string[]; integration: string[]; browser: string[] }
export interface Catalog { version: number; features: Feature[]; layers: Record<string, string[]>; conditional: ConditionalTest[]; pyramidTarget?: Record<string, number>; pyramids?: Pyramid[] }
export function sourceFile(path: string): boolean;
export function testFile(path: string): boolean;
export function migrationStatements(source: string): string[];
export function validateCatalog(catalog: Catalog, files: string[]): string[];
export function validateChanges(catalog: Catalog, changes: { path: string; status: string }[], previous?: Catalog): string[];
export function inspectTests(source: string, file: string): ConditionalTest[];
export function validateTestControls(controls: ConditionalTest[], conditional: ConditionalTest[], previous?: ConditionalTest[]): string[];
export interface TestResult { file: string; title: string; status: "passed" | "failed" | "skipped"; flaky?: boolean }
export function mergeBrowserResults(local: TestResult[], cloud: TestResult[], required: ConditionalTest[]): { records: TestResult[]; errors: string[] };
export function summarizeResults(catalog: Catalog, records: TestResult[]): { counts: Record<string, { passed: number; failed: number; skipped: number }>; pyramids: unknown[]; features: {id: string; name: string; passed: number; failed: number; skipped: number; missing: string[]; status: string}[]; conditional: TestResult[]; errors: string[] };
