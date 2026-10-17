import { clearOnboardingDraft } from "./db";

// Before Start there is no recovery-protected vault. Never persist a recovery
// code beside a key that can decrypt it; a fresh page generates a fresh draft.
export interface Draft { handle: string; code: string }
let draft: Draft | null = null;
export async function saveDraft(value: Draft): Promise<void> { await clearOnboardingDraft(); draft = { ...value }; }
export async function loadDraft(): Promise<Draft | null> { await clearOnboardingDraft(); return draft ? { ...draft } : null; }
export async function clearDraft(): Promise<void> { draft = null; await clearOnboardingDraft(); }
