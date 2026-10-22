const SESSION_KEY = "kuro-remote-model-credential-session";
const MAX_API_KEY_LENGTH = 4096;

function normalizedEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Remote model keys live only in sessionStorage and are bound to the exact endpoint.
 * A key saved for one provider is never returned for a different URL.
 */
export function hasRemoteModelConsent(baseUrl: string): boolean {
  const endpoint = normalizedEndpoint(baseUrl);
  if (!endpoint) return "";
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const record = value as Record<string, unknown>;
    return record.baseUrl === endpoint && record.consented === true;
  } catch {
    return "";
  }
}

/** Save only to tab/session storage, never localStorage or a .kuro package. */


/** Read the session-scoped consent paired with a previously saved remote route. */
export function readRemoteModelCredential(baseUrl: string): string {
  const endpoint = normalizedEndpoint(baseUrl);
  if (!endpoint) return "";
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const record = value as Record<string, unknown>;
    if (record.baseUrl !== endpoint || typeof record.apiKey !== "string") return "";
    return record.apiKey.trim().slice(0, MAX_API_KEY_LENGTH);
  } catch {
    return "";
  }
}

export function saveRemoteModelCredential(baseUrl: string, apiKey: string, consented: boolean): void {
  const endpoint = normalizedEndpoint(baseUrl);
  const key = apiKey.trim().slice(0, MAX_API_KEY_LENGTH);
  try {
    if (!endpoint || !consented) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ baseUrl: endpoint, apiKey: key, consented: true }));
  } catch {
    throw new Error("The browser could not save this provider key for the current session. Check session storage settings and retry.");
  }
}

export function clearRemoteModelCredential(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage may be disabled */ }
}
