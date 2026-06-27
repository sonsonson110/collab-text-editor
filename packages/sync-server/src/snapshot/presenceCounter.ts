/**
 * Distributed Presence Counter
 *
 * Manages a per-room, per-node crash-detection heartbeat in Redis alongside
 * the distributed connection counter exported from `redis.ts`.
 *
 * Why a heartbeat?
 * ─────────────────
 * The distributed counter (`room:connections:<roomId>`) is atomically accurate
 * as long as every disconnect fires a DECR. If a sync-server node crashes hard
 * (SIGKILL, OOM, hardware failure), DECR never runs and the counter stays
 * permanently positive — preventing teardown and compaction forever.
 *
 * To mitigate this, each node sets a per-room heartbeat key in Redis with a
 * 60-second TTL and refreshes it every 15 seconds while it has active
 * connections. The compaction worker independently checks for streams with no
 * recent XADD activity (stale-stream path) and triggers compaction regardless
 * of the counter value if the room appears abandoned.
 *
 * Design invariant:
 *   - Heartbeat keys: `room:heartbeat:<roomId>:<nodeId>` (TTL = 60 s)
 *   - Presence counter: `room:connections:<roomId>` (integer, no TTL)
 *   - Counter cleanup: `deletePresenceKey` is called after teardown completes.
 */

import {
  redis,
  NODE_ID,
  REDIS_KEY_ROOM_HEARTBEAT_PREFIX,
} from "../infra/redisClient.js";

/** How often (ms) the heartbeat key is refreshed while a room is active. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/** TTL (seconds) for the heartbeat key — must be > HEARTBEAT_INTERVAL_MS / 1000. */
const HEARTBEAT_TTL_S = 60;

/** Tracks active heartbeat intervals keyed by roomId. */
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Starts a repeating heartbeat for the given room on this node.
 *
 * The heartbeat key `room:heartbeat:<roomId>:<nodeId>` is SET immediately and
 * then refreshed every {@link HEARTBEAT_INTERVAL_MS} milliseconds. If the
 * process crashes, the key expires after {@link HEARTBEAT_TTL_S} seconds.
 *
 * Safe to call multiple times for the same room — returns immediately if a
 * heartbeat is already running for this room on this node.
 *
 * @param roomId The room UUID string.
 */
export function startHeartbeat(roomId: string): void {
  if (heartbeatTimers.has(roomId)) return;

  const key = `${REDIS_KEY_ROOM_HEARTBEAT_PREFIX}${roomId}:${NODE_ID}`;

  /** Refreshes the TTL by re-setting the key. */
  const refresh = (): void => {
    redis.set(key, "1", "EX", HEARTBEAT_TTL_S).catch((err: Error) => {
      console.warn(
        `[presenceCounter] Heartbeat refresh failed for room ${roomId}:`,
        err.message,
      );
    });
  };

  // Set immediately so the key is present before the first interval fires.
  refresh();
  const timer = setInterval(refresh, HEARTBEAT_INTERVAL_MS);
  heartbeatTimers.set(roomId, timer);
}

/**
 * Stops the heartbeat for the given room on this node and deletes the key.
 *
 * Call this when the last local connection for a room disconnects (regardless
 * of whether it is the global last connection). The key will expire naturally
 * within {@link HEARTBEAT_TTL_S} seconds if deletion fails.
 *
 * @param roomId The room UUID string.
 */
export function stopHeartbeat(roomId: string): void {
  const timer = heartbeatTimers.get(roomId);
  if (!timer) return;

  clearInterval(timer);
  heartbeatTimers.delete(roomId);

  const key = `${REDIS_KEY_ROOM_HEARTBEAT_PREFIX}${roomId}:${NODE_ID}`;
  redis.del(key).catch((err: Error) => {
    // Non-fatal: key will expire on its own within HEARTBEAT_TTL_S seconds.
    console.warn(
      `[presenceCounter] Failed to delete heartbeat key for room ${roomId}:`,
      err.message,
    );
  });
}
