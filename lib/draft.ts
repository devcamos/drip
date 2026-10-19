import { clearOnboardingDraft } from "./db";

// Keep unfinished signup names in memory only; never persist a password or root.
export interface Draft { handle: string }
let draft: Draft | null = null;
export async function saveDraft(value: Draft): Promise<void> { await clearOnboardingDraft(); draft = { ...value }; }
export async function loadDraft(): Promise<Draft | null> { await clearOnboardingDraft(); return draft ? { ...draft } : null; }
export async function clearDraft(): Promise<void> { draft = null; await clearOnboardingDraft(); }
