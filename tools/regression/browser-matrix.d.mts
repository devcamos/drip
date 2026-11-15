export type BrowserJourney = { file: string; title: string };
export const webkitJourneys: BrowserJourney[];
export function validateBrowserMatrix(reporter: unknown, required?: BrowserJourney[]): { passed: number; required: number; errors: string[] };
