/**
 * Delta Scheduler — Incremental Yjs Persistence (Phase 3)
 *
 * Replaces the former `snapshotScheduler` which serialised the entire Y.Doc
 * every 5–60 seconds and HTTP-PUT it to the api-server. That approach scaled
 * poorly: a 1 MB document meant 1 MB of binary serialisation + network I/O
 * on every save, and multiple nodes competed to overwrite the same row.
 *
 * New approach:
 * ─────────────
 * 1. Each raw Yjs delta (`Uint8Array` from `doc.on("update")`) is buffered in
 *    memory per room.
 * 2. Every {@link FLUSH_INTERVAL_MS} (1 second), all buffered deltas are
 *    flushed to the Redis Stream `room:updates:<roomId>` via XADD.
 * 3. A separate {@link compactionWorker} periodically reads the stream,
 *    merges the deltas with the last full snapshot in PostgreSQL, writes the
 *    new snapshot, and trims the stream.
 *
 * The `onSaved` callback (originally invoked after each debounced full-save)
 * is now invoked by the compaction worker after each successful compaction so
 * the `MSG_SNAPSHOT_SAVED` timestamp shown in the client UI reflects a truly
 * durable state.
 *
 * Teardown:
 * ─────────
 * `stopTracking` flushes any remaining buffered deltas immediately (bypassing
 * the interval) so no edits are lost when the last client disconnects.
 * The caller (index.ts) is responsible for triggering final compaction.
 */

import * as Y from "yjs";
import { appendDeltaToStream } from "../redis.js";

/** How often buffered deltas are flushed to the Redis Stream. */
const FLUSH_INTERVAL_MS = 1_000;

/**
 * Callback invoked after a snapshot has been successfully compacted and
 * persisted to PostgreSQL. Matches the signature used by the former
 * snapshotScheduler for API compatibility.
 *
 * @param roomId    The room UUID that was saved.
 * @param timestamp Unix epoch milliseconds of the save.
 */
export type OnSnapshotSaved = (roomId: string, timestamp: number) => void;

/** Per-room state maintained by the delta scheduler. */
interface RoomSchedulerState {
  /** In-memory buffer of raw Yjs deltas not yet flushed to Redis. */
  pendingDeltas: Uint8Array[];
  /** Interval ID for the periodic flush timer. */
  flushTimer: ReturnType<typeof setInterval>;
  /** `doc.on("update")` listener — stored so we can remove it on stop. */
  updateListener: (update: Uint8Array) => void;
  /** Optional callback forwarded from startTracking for the compaction worker. */
  onSaved: OnSnapshotSaved | null;
}

const schedulers = new Map<string, RoomSchedulerState>();

/**
 * Flushes all buffered deltas for a room to the Redis Stream.
 *
 * Each delta is pushed as a separate XADD call so stream entries correspond
 * 1-to-1 with Yjs updates. This preserves ordering and avoids the need to
 * merge deltas before appending.
 *
 * This function is intentionally fire-and-forget (`void`) when called from
 * the interval; the caller awaits it during teardown.
 */
async function flushPendingDeltas(
  roomId: string,
  state: RoomSchedulerState,
): Promise<void> {
  if (state.pendingDeltas.length === 0) return;

  // Snapshot and clear the buffer atomically (synchronous slice + reset)
  // so new deltas that arrive during the async XADD calls are not lost.
  const toFlush = state.pendingDeltas.splice(0);

  for (const delta of toFlush) {
    await appendDeltaToStream(roomId, delta);
  }
}

/**
 * Starts tracking document changes for a room and scheduling delta flushes.
 *
 * <p>On every `doc.on("update")` event, the raw delta is appended to an
 * in-memory buffer. Every {@link FLUSH_INTERVAL_MS} the buffer is drained
 * to Redis Streams via XADD.
 *
 * <p>The `onSaved` callback is stored and forwarded to the compaction worker
 * (via `getOnSaved`); it is NOT called here because individual delta flushes
 * do not constitute a durable save on their own.
 *
 * @param roomId  Room UUID string.
 * @param doc     The Yjs document to track.
 * @param onSaved Optional callback invoked by the compaction worker after
 *                each successful compaction (not after each flush).
 */
export function startTracking(
  roomId: string,
  doc: Y.Doc,
  onSaved?: OnSnapshotSaved,
): void {
  if (schedulers.has(roomId)) return; // Already tracking

  const state: RoomSchedulerState = {
    pendingDeltas: [],
    flushTimer: setInterval(() => {
      void flushPendingDeltas(roomId, state);
    }, FLUSH_INTERVAL_MS),
    updateListener: () => {}, // placeholder; replaced below
    onSaved: onSaved ?? null,
  };

  const onUpdate = (update: Uint8Array): void => {
    // Buffer the raw delta — no serialisation, no HTTP, no blocking.
    state.pendingDeltas.push(update);
  };

  state.updateListener = onUpdate;
  doc.on("update", onUpdate);
  schedulers.set(roomId, state);
}

/**
 * Stops tracking a room and flushes any remaining buffered deltas immediately.
 *
 * Should be called when the last **local** client disconnects from a room,
 * before the Y.Doc is destroyed. The caller (index.ts) must subsequently
 * trigger compaction via `triggerImmediateCompaction` (from compactionWorker)
 * to produce the final durable snapshot.
 *
 * @param roomId Room UUID string.
 * @param doc    The Yjs document being torn down.
 */
export async function stopTracking(roomId: string, doc: Y.Doc): Promise<void> {
  const state = schedulers.get(roomId);
  if (!state) return;

  clearInterval(state.flushTimer);
  doc.off("update", state.updateListener);
  schedulers.delete(roomId);

  // Flush any deltas that arrived since the last interval tick.
  await flushPendingDeltas(roomId, state);
}

/**
 * Returns the `onSaved` callback registered for the given room, if any.
 *
 * Used by the compaction worker to invoke the callback after a successful
 * compaction without coupling it to this module's internal state.
 *
 * @param roomId Room UUID string.
 * @returns The callback, or `null` if no callback was registered or the
 *          room is no longer being tracked.
 */
export function getOnSaved(roomId: string): OnSnapshotSaved | null {
  return schedulers.get(roomId)?.onSaved ?? null;
}
