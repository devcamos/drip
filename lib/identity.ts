/**
 * Gamertag identity, stored on the device only. No personal data.
 * The user types their own handle. Uniqueness is NOT checked until sync exists;
 * if the name is taken then, sync adds a short numeric suffix.
 */
/** suffix is optional: only added later, by sync, if the handle is already taken. */
export interface Identity { id: string; handle: string; suffix?: string; createdAt: string }

export const HANDLE_RE = /^[A-Za-z0-9_]{3,16}$/;

export function handleError(h: string): string | null {
  if (h.length < 3) return "Use at least 3 characters.";
  if (h.length > 16) return "Use 16 characters or fewer.";
  if (!HANDLE_RE.test(h)) return "Only letters, numbers and underscore.";
  return null;
}

/** Random 4-digit suffix, for sync to use if a handle is taken. Not used in v1. */
export function randomSuffix(): string {
  const max = 65536 - (65536 % 10000);
  for (;;) { const [n] = crypto.getRandomValues(new Uint16Array(1)); if (n < max) return String(n % 10000).padStart(4, "0"); }
}

export const formatTag = (i: Pick<Identity, "handle" | "suffix">) => (i.suffix ? `${i.handle}#${i.suffix}` : i.handle);

export function newIdentity(handle: string, now = new Date()): Identity {
  const err = handleError(handle);
  if (err) throw new Error(err);
  return { id: crypto.randomUUID(), handle, createdAt: now.toISOString() };
}

/** For future sync: attach a suffix when the server says the handle is taken. */
export function withSuffix(i: Identity, suffix: string): Identity {
  if (!/^\d{1,4}$/.test(suffix)) throw new Error("Bad suffix");
  return { ...i, suffix };
}

export function isIdentity(x: unknown): x is Identity {
  const i = x as Identity;
  return !!i && typeof i.id === "string" && /^[0-9a-f-]{36}$/.test(i.id) && HANDLE_RE.test(i.handle ?? "") && (i.suffix === undefined || /^\d{1,4}$/.test(i.suffix));
}

/** UUID string -> 16 raw bytes, used as the WebAuthn user.id. */
export function idBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Bad id");
  return Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
}
