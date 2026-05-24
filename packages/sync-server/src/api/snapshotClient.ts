/**
 * HTTP client for sync-server → api-server snapshot persistence calls.
 *
 * All requests attach the {@code x-internal-secret} header so the
 * {@code InternalApiFilter} on the Spring side accepts them with ROLE_SERVICE.
 *
 * Environment variables required:
 *   - `API_BASE_URL`       — e.g. `http://api-server:8081` (Docker) or `http://localhost:8081` (dev)
 *   - `INTERNAL_API_SECRET` — must match `app.internal-api.secret` in api-server
 */

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

if (!INTERNAL_API_SECRET) {
  throw new Error(
    "[snapshotClient] INTERNAL_API_SECRET environment variable is not set. " +
      "Set it to the same value as APP_INTERNAL_API_SECRET on the api-server.",
  );
}

/** Common headers attached to every internal request. */
const internalHeaders: Record<string, string> = {
  "x-internal-secret": INTERNAL_API_SECRET,
};

/**
 * Fetches the latest binary Yjs snapshot for the given room from the api-server.
 *
 * @param roomId The room's UUID string.
 * @returns The raw Uint8Array snapshot, or `null` if no snapshot exists yet (204).
 * @throws If the request fails with a non-2xx status other than 204.
 */
export async function fetchSnapshot(roomId: string): Promise<Uint8Array | null> {
  const url = `${API_BASE_URL}/api/internal/rooms/${roomId}/snapshot`;

  let response: Response;
  try {
    response = await fetch(url, { headers: internalHeaders });
  } catch (err) {
    console.error(`[snapshotClient] Network error fetching snapshot for room ${roomId}:`, err);
    return null;
  }

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    console.error(
      `[snapshotClient] Failed to fetch snapshot for room ${roomId}: ${response.status}`,
    );
    return null;
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Persists the binary Yjs document state for the given room to the api-server.
 *
 * Errors are logged but not re-thrown — a failed snapshot save should never
 * crash the sync-server or interrupt the editing session.
 *
 * @param roomId The room's UUID string.
 * @param data   Binary Yjs state from `Y.encodeStateAsUpdate(doc)`.
 */
export async function saveSnapshot(roomId: string, data: Uint8Array): Promise<void> {
  const url = `${API_BASE_URL}/api/internal/rooms/${roomId}/snapshot`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...internalHeaders,
        "Content-Type": "application/octet-stream",
      },
      body: data,
    });

    if (!response.ok) {
      console.error(
        `[snapshotClient] Failed to save snapshot for room ${roomId}: ${response.status}`,
      );
    }
  } catch (err) {
    console.error(`[snapshotClient] Network error saving snapshot for room ${roomId}:`, err);
  }
}
