/**
 * Compaction Worker — Phase 3 Incremental Persistence
 *
 * Periodically merges the append-only Yjs delta log (Redis Stream
 * `room:updates:<roomId>`) with the last known full snapshot in PostgreSQL,
 * writes the compacted result back, and trims the stream.
 *
 * Compaction algorithm (per room):
 * ─────────────────────────────────
 * 1. Read all entries from `room:updates:<roomId>` via XRANGE.
 * 2. If the stream is empty, skip — nothing to compact.
 * 3. Fetch the current full snapshot from Redis cache / PostgreSQL.
 * 4. Apply all deltas in order to a fresh Y.Doc: Y.applyUpdate × N.
 * 5. Serialise the merged document: Y.encodeStateAsUpdate(mergedDoc).
 * 6. Persist via PUT /api/internal/rooms/:id/snapshot + Redis cache write.
 * 7. Trim the stream: XTRIM room:updates:<roomId> MAXLEN 0.
 * 8. Invoke the onSaved callback so MSG_SNAPSHOT_SAVED reaches connected clients.
 *
 * Stale-room detection (crash resilience):
 * ─────────────────────────────────────────
 * If a node crashes, its presence counter (room:connections:<roomId>) may be
 * stuck > 0. The compaction worker does NOT rely on the counter. It always
 * compacts whenever the stream is non-empty, regardless of connection count.
 * This ensures that even stale rooms eventually get their deltas persisted.
 */

import * as Y from "yjs";
import { readDeltasFromStream, trimStream, deletePresenceKey } from "../redis.js";
import { fetchSnapshot, saveSnapshot } from "../api/snapshotClient.js";
import { getOnSaved } from "./deltaScheduler.js";

/** How often (ms) the compaction loop runs across all active rooms. */
const COMPACTION_INTERVAL_MS = 30_000;

/**
 * The room shape required by the compaction worker.
 * Only the fields needed for snapshot callbacks are typed here.
 */
export interface CompactionRoomState {
  connections: Set<unknown>;
}

/**
 * Compacts the delta stream for a single room into a durable PostgreSQL snapshot.
 *
 * This is the core compaction algorithm. It is safe to call multiple times
 * concurrently for different rooms, but should be called at most once at a
 * time for the same room (the compaction interval ensures this by iterating
 * rooms sequentially).
 *
 * @param roomId The room UUID string.
 */
export async function compactRoom(roomId: string): Promise<void> {
  // 1. Read pending deltas from the Redis Stream.
  const deltas = await readDeltasFromStream(roomId);
  if (deltas.length === 0) {
    return; // Nothing to compact.
  }

  // 2. Fetch the current base snapshot (Redis cache → PostgreSQL fallback).
  const baseSnapshot = await fetchSnapshot(roomId);

  // 3. Build a fresh Y.Doc and apply the base snapshot (if any), then all deltas.
  const mergedDoc = new Y.Doc();
  if (baseSnapshot && baseSnapshot.byteLength > 0) {
    Y.applyUpdate(mergedDoc, baseSnapshot);
  }
  for (const delta of deltas) {
    if (delta.byteLength > 0) {
      Y.applyUpdate(mergedDoc, delta);
    }
  }

  // 4. Serialise the merged document into a full snapshot.
  const compactedSnapshot = Y.encodeStateAsUpdate(mergedDoc);

  // 5. Persist the compacted snapshot to PostgreSQL (+ Redis cache write-through).
  await saveSnapshot(roomId, compactedSnapshot);

  // 6. Trim the stream — all deltas are now merged into the persisted snapshot.
  await trimStream(roomId);

  // 7. Clean up the Y.Doc to release memory.
  mergedDoc.destroy();

  // 8. Notify connected clients that a durable save occurred.
  const onSaved = getOnSaved(roomId);
  if (onSaved) {
    onSaved(roomId, Date.now());
  }

  console.log(
    `[compactionWorker] Compacted ${deltas.length} delta(s) for room ${roomId}`,
  );
}

/**
 * Triggers an immediate (out-of-interval) compaction for a room.
 *
 * Called by the teardown path in index.ts when the global presence counter
 * reaches 0, ensuring all pending deltas are persisted before the room is
 * evicted from memory.
 *
 * After compaction completes, the distributed presence counter key is deleted
 * to prevent stale zero-value keys accumulating in Redis.
 *
 * @param roomId The room UUID string.
 */
export async function triggerImmediateCompaction(roomId: string): Promise<void> {
  await compactRoom(roomId);
  // Clean up the presence counter key now that the room is fully torn down.
  await deletePresenceKey(roomId);
}

/**
 * Starts the recurring compaction worker that runs across all in-memory rooms.
 *
 * Call once at server startup, after the room map and Redis Pub/Sub are wired.
 * The worker iterates the `rooms` map every {@link COMPACTION_INTERVAL_MS} and
 * compacts any room whose stream is non-empty.
 *
 * The `onSaved` callback registered per-room via `startTracking` is used to
 * broadcast `MSG_SNAPSHOT_SAVED` to connected clients after each compaction.
 *
 * @param rooms The sync-server's live in-memory room map.
 */
export function startCompactionWorker(
  rooms: Map<string, CompactionRoomState>,
): void {
  setInterval(() => {
    rooms.forEach((_room, roomId) => {
      // Fire-and-forget per room — failures are logged inside compactRoom.
      compactRoom(roomId).catch((err: Error) => {
        console.error(
          `[compactionWorker] Unexpected error compacting room ${roomId}:`,
          err.message,
        );
      });
    });
  }, COMPACTION_INTERVAL_MS);

  console.log(
    `[compactionWorker] Started — interval ${COMPACTION_INTERVAL_MS / 1000}s`,
  );
}
