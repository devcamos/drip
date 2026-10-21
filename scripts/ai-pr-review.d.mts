export function redactSecrets(value: unknown, apiKey?: string): string;
export function describeGeminiError(error: unknown, model?: string): { reason: string; recovery: string; [key: string]: any };
export function isRetryableGeminiError(error: unknown): boolean;
export function parseStructuredReview(text: string): any;
export function renderStructuredReview(review: any, metadata?: any, diagnostics?: any): string;
