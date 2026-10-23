import { isValidCode } from "./crypto";

export const MAX_RECOVERY_FILE_BYTES = 32_768;
export class RecoveryFileError extends Error {}

/** Read the existing downloadable format locally; never send the file to auth. */
export function parseRecoveryCodesFile(text: string): string[] {
  if (new TextEncoder().encode(text).byteLength > MAX_RECOVERY_FILE_BYTES) throw new RecoveryFileError("Choose a Drip recovery text file smaller than 32 KB.");
  const matches = text.toUpperCase().match(/\b(?:DRIP2-)?(?:[A-Z0-9]{4}-){5}[A-Z0-9]{4}\b/g) ?? [];
  const codes = [...new Set(matches.filter(isValidCode))];
  if (!codes.length || codes.length > 6) throw new RecoveryFileError("No supported recovery-code list found. Choose drip-recovery-codes.txt or paste one complete code.");
  return codes;
}
