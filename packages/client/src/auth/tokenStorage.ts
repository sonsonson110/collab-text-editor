/**
 * Thin localStorage-backed token store.
 *
 * Responsibilities:
 * - Read/write the JWT string in localStorage under a consistent key.
 * - Detect expired tokens without making a network call (client-side JWT decode,
 *   no signature verification — we trust the server to reject invalid tokens).
 */

const TOKEN_KEY = "collab_token";

/** Returns the stored JWT string, or `null` if none is present. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persists a JWT to localStorage. */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Removes the stored JWT from localStorage. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Decodes the JWT payload (Base64URL → JSON) without verifying the signature.
 * Used only to inspect the `exp` and `role` claims client-side.
 *
 * @param token A compact JWT string.
 * @returns The decoded payload, or `null` if the token is malformed.
 */
export function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns `true` if the token's `exp` claim is in the past (or the token is malformed).
 *
 * @param token A compact JWT string.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload || typeof payload["exp"] !== "number") {
    return true;
  }
  // `exp` is in seconds; Date.now() is in milliseconds
  return payload["exp"] * 1000 < Date.now();
}

/**
 * Extracts the `role` claim from the stored token without network calls.
 * Returns `null` if there is no token or it is malformed.
 */
export function getTokenRole(): string | null {
  const token = getToken();
  if (!token) {
    return null;
  }
  const payload = decodePayload(token);
  return typeof payload?.["role"] === "string" ? payload["role"] : null;
}

/**
 * Extracts the `displayName` claim from a JWT payload without network calls.
 *
 * Authenticated tokens carry a `displayName` claim set by the api-server.
 * Guest tokens do not — this function returns `null` in that case so callers
 * can fall back to a generated anonymous name.
 *
 * @param token A compact JWT string.
 * @returns The user's display name, or `null` for guests / malformed tokens.
 */
export function getDisplayNameFromToken(token: string): string | null {
  const payload = decodePayload(token);
  return typeof payload?.["displayName"] === "string"
    ? payload["displayName"]
    : null;
}

/**
 * Extracts the `sub` claim (user ID) from a JWT payload without network calls.
 *
 * @param token A compact JWT string.
 * @returns The user ID, or `null` if the token is malformed.
 */
export function getUserIdFromToken(token: string): string | null {
  const payload = decodePayload(token);
  return typeof payload?.["sub"] === "string" ? payload["sub"] : null;
}
