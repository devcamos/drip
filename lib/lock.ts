/**
 * Optional app lock. A UI gate only: it stops casual access to the screens,
 * but data in IndexedDB is NOT encrypted by it. Anyone with device access and
 * developer tools could still read local data.
 */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

/** Lock when enabled and either first open or hidden for at least 5 minutes. */
export function shouldLock(enabled: boolean, hiddenAt: number | null, now: number, firstOpen: boolean): boolean {
  if (!enabled) return false;
  if (firstOpen) return true;
  return hiddenAt !== null && now - hiddenAt >= LOCK_AFTER_MS;
}

const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

type Creds = Pick<CredentialsContainer, "create" | "get">;

export async function passkeySupported(pkc: any = (globalThis as any).PublicKeyCredential): Promise<boolean> {
  try { return !!pkc && (await pkc.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}

/** Register a device passkey (Face ID / Touch ID). Returns the credential id. No server: we only need the local check. */
export async function registerPasskey(creds: Creds, rpId: string, user: { id: Uint8Array; name: string }): Promise<string> {
  const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const cred = (await creds.create({
    publicKey: {
      challenge: rnd(32), rp: { name: "Drip", id: rpId },
      user: { id: user.id as BufferSource, name: user.name, displayName: user.name },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000, attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey wasn't created");
  return b64u(cred.rawId);
}

/** Ask the platform authenticator to verify the user. True only when it returns our credential. */
export async function verifyPasskey(creds: Creds, credentialId: string, rpId: string): Promise<boolean> {
  try {
    const cred = (await creds.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId, userVerification: "required", timeout: 60000,
        allowCredentials: [{ type: "public-key", id: unb64u(credentialId) }] },
    })) as PublicKeyCredential | null;
    return !!cred && b64u(cred.rawId) === credentialId;
  } catch { return false; }
}
