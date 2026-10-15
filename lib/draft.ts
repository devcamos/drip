import { getItem, setItem } from "./db";

/**
 * Onboarding draft, kept until Start is tapped so leaving the page doesn't lose
 * the recovery code. The code is encrypted with a non-extractable AES-GCM key
 * that lives only in this browser's IndexedDB (it can't be exported or read out).
 */
const KEY = "onboardingDraft";
interface Stored { handle: string; key: CryptoKey; iv: Uint8Array; ct: ArrayBuffer }
export interface Draft { handle: string; code: string }

export async function saveDraft(d: Draft): Promise<void> {
  const prev = await getItem<Stored>(KEY);
  const key = prev?.key ?? (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(d.code));
  await setItem(KEY, { handle: d.handle, key, iv, ct } satisfies Stored);
}

export async function loadDraft(): Promise<Draft | null> {
  const s = await getItem<Stored>(KEY);
  if (!s) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv as BufferSource }, s.key, s.ct);
    return { handle: s.handle, code: new TextDecoder().decode(pt) };
  } catch { return null; }
}

export async function clearDraft(): Promise<void> { await setItem(KEY, undefined); }
