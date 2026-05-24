import { getToken, setToken, isTokenExpired } from "./tokenStorage";

/**
 * Ensures a valid JWT is present in localStorage.
 *
 * If no token exists or the stored token is expired, calls `POST /api/auth/guest`
 * to obtain a fresh Guest JWT and persists it. Returns the valid token string.
 *
 * @returns A valid JWT (guest or member) ready to use in API and WebSocket calls.
 * @throws If the guest token request fails (network error or server error).
 */
export async function ensureToken(): Promise<string> {
  const stored = getToken();
  if (stored !== null && !isTokenExpired(stored)) {
    return stored;
  }

  // No valid token — acquire a guest token
  const response = await fetch("/api/auth/guest", { method: "POST" });

  if (!response.ok) {
    throw new Error(`Failed to acquire guest token: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { token: string };
  setToken(body.token);
  return body.token;
}
