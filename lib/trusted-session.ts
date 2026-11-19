import { safeFetch } from "./worker-safety";
import type { TrustedSessionCheck } from "./db";

/** Check the server session without treating an unavailable service as revocation. */
export const verifyTrustedSession: TrustedSessionCheck = async owner => {
  if (!navigator.onLine) return "offline";
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    // safeFetch may be waiting behind another private request before fetch sees
    // its abort signal. Bound the entire operation as well as network I/O.
    const response = await Promise.race([
      safeFetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) }),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Session verification timed out")), 8000); }),
    ]);
    if (response.status === 401) return "invalid";
    if (!response.ok) return "unavailable";
    const data: unknown = await response.json();
    if (data === null) return "invalid";
    if (typeof data !== "object" || !("user" in data) || !data.user || typeof data.user !== "object" || !("id" in data.user) || typeof data.user.id !== "string") return "unavailable";
    return data.user.id === owner ? "valid" : "invalid";
  } catch { return "unavailable"; }
  finally { clearTimeout(deadline); }
};
