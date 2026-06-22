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

import { redis, REDIS_KEY_ROOM_STATE_PREFIX } from "../redis.js";

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
 * Fetches the latest binary Yjs snapshot for the given room.
 *
 * Resolution order:
 *   1. Redis cache (`room:state:<roomId>`) — fast path, avoids api-server round-trip.
 *   2. api-server (PostgreSQL) — on cache miss; result is stored in Redis for
 *      subsequent nodes or restarts.
 *
 * @param roomId The room's UUID string.
 * @returns The raw Uint8Array snapshot, or `null` if no snapshot exists yet.
 * @throws If the request fails with a non-2xx status other than 204.
 */
export async function fetchSnapshot(roomId: string): Promise<Uint8Array | null> {
  // 1. Check Redis cache first.
  try {
    const cached = await redis.getBuffer(`${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`);
    if (cached) {
      console.log(`[snapshotClient] Cache hit for room ${roomId} (${cached.byteLength} bytes)`);
      return new Uint8Array(cached);
    }
  } catch (err) {
    // Non-fatal: log and fall through to the api-server.
    console.warn(`[snapshotClient] Redis cache lookup failed for room ${roomId}:`, err);
  }

  // 2. Fall back to api-server (PostgreSQL).
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
  const data = new Uint8Array(buffer);

  // 3. Populate Redis cache so other nodes and future restarts can use it.
  redis
    .set(`${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`, Buffer.from(data))
    .catch((err: unknown) => {
      console.warn(`[snapshotClient] Failed to cache snapshot in Redis for room ${roomId}:`, err);
    });

  return data;
}

/**
 * Persists the binary Yjs document state for the given room to the api-server
 * and concurrently updates the Redis snapshot cache.
 *
 * Errors are logged but not re-thrown — a failed snapshot save should never
 * crash the sync-server or interrupt the editing session.
 *
 * @param roomId The room's UUID string.
 * @param data   Binary Yjs state from `Y.encodeStateAsUpdate(doc)`.
 */
export async function saveSnapshot(roomId: string, data: Uint8Array): Promise<void> {
  const url = `${API_BASE_URL}/api/internal/rooms/${roomId}/snapshot`;

  // Write through to Redis cache concurrently — no need to await.
  redis
    .set(`${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`, Buffer.from(data))
    .catch((err: unknown) => {
      console.warn(`[snapshotClient] Failed to update Redis cache for room ${roomId}:`, err);
    });

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...internalHeaders,
        "Content-Type": "application/octet-stream",
      },
      // Buffer.from() ensures a plain ArrayBuffer-backed view, satisfying
      // BodyInit's type constraint. Uint8Array<ArrayBufferLike> is rejected
      // because ArrayBufferLike includes SharedArrayBuffer which fetch rejects.
      body: Buffer.from(data),
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
