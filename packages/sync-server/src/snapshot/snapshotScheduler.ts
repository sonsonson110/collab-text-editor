import * as Y from "yjs";
import { saveSnapshot } from "../api/snapshotClient.js";

/** Debounce delay: snapshot fires this many ms after the last document change. */
const DEBOUNCE_DELAY_MS = 5_000;

/** Maximum time between saves even during continuous editing activity. */
const MAX_WAIT_MS = 60_000;

/**
 * Callback invoked after a snapshot has been successfully persisted.
 *
 * @param roomId    The room UUID that was saved.
 * @param timestamp Unix epoch milliseconds of the save.
 */
export type OnSnapshotSaved = (roomId: string, timestamp: number) => void;

/**
 * Per-room state for the debounced + max-wait snapshot scheduler.
 */
interface RoomSchedulerState {
  /** Timeout ID for the debounce timer. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp of the last successful snapshot save. */
  lastSavedAt: number;
  /** Timeout ID for the max-wait ceiling timer. */
  maxWaitTimer: ReturnType<typeof setTimeout> | null;
  /** The update listener attached to the Y.Doc. Stored so we can remove it on stop. */
  updateListener: (update: Uint8Array) => void;
  /** Optional callback fired after each successful save. */
  onSaved: OnSnapshotSaved | null;
}

const schedulers = new Map<string, RoomSchedulerState>();

/**
 * Starts tracking document changes for a room and scheduling snapshot saves.
 *
 * <p>Snapshot policy:
 * <ul>
 *   <li><b>Debounce:</b> saves {@link DEBOUNCE_DELAY_MS} ms after the last change.</li>
 *   <li><b>Max-wait ceiling:</b> forces a save every {@link MAX_WAIT_MS} ms during
 *       continuous editing regardless of the debounce timer.</li>
 *   <li><b>Teardown:</b> {@link stopTracking} performs a final save when called.</li>
 * </ul>
 *
 * @param roomId  Room UUID string (used as the snapshot API key).
 * @param doc     The Yjs document to track.
 * @param onSaved Optional callback invoked after each successful snapshot save.
 */
export function startTracking(
  roomId: string,
  doc: Y.Doc,
  onSaved?: OnSnapshotSaved,
): void {
  if (schedulers.has(roomId)) {
    return; // Already tracking
  }

  const state: RoomSchedulerState = {
    debounceTimer: null,
    lastSavedAt: Date.now(),
    maxWaitTimer: null,
    updateListener: () => {}, // placeholder, replaced below
    onSaved: onSaved ?? null,
  };

  async function persist(): Promise<void> {
    const data = Y.encodeStateAsUpdate(doc);
    await saveSnapshot(roomId, data);
    const now = Date.now();
    state.lastSavedAt = now;
    state.onSaved?.(roomId, now);
  }

  const onUpdate = (): void => {
    // --- Debounce: reset timer on every change ---
    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      // Cancel max-wait if debounce fires first
      if (state.maxWaitTimer !== null) {
        clearTimeout(state.maxWaitTimer);
        state.maxWaitTimer = null;
      }
      void persist();
    }, DEBOUNCE_DELAY_MS);

    // --- Max-wait ceiling: force save if continuously editing ---
    if (state.maxWaitTimer === null) {
      state.maxWaitTimer = setTimeout(() => {
        state.maxWaitTimer = null;
        // Cancel debounce since max-wait fired first
        if (state.debounceTimer !== null) {
          clearTimeout(state.debounceTimer);
          state.debounceTimer = null;
        }
        void persist();
      }, MAX_WAIT_MS);
    }
  };

  state.updateListener = onUpdate;
  doc.on("update", onUpdate);
  schedulers.set(roomId, state);
}

/**
 * Stops tracking a room and performs a final snapshot save before teardown.
 *
 * Should be called when the last client disconnects from a room, immediately
 * before the Y.Doc is destroyed.
 *
 * @param roomId Room UUID string.
 * @param doc    The Yjs document being torn down.
 */
export async function stopTracking(roomId: string, doc: Y.Doc): Promise<void> {
  const state = schedulers.get(roomId);
  if (!state) {
    return;
  }

  // Clear pending timers — we're about to save synchronously
  if (state.debounceTimer !== null) {
    clearTimeout(state.debounceTimer);
  }
  if (state.maxWaitTimer !== null) {
    clearTimeout(state.maxWaitTimer);
  }

  doc.off("update", state.updateListener);
  schedulers.delete(roomId);

  // Final save on teardown
  const data = Y.encodeStateAsUpdate(doc);
  await saveSnapshot(roomId, data);
  // No need to invoke onSaved here — all clients have already disconnected.
}
