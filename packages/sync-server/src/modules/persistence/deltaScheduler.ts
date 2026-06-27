import { appendDeltaToStream } from "./streamHelpers.js";
import { TypedEventEmitter } from "../../infra/eventBus.js";
import { MSG_SNAPSHOT_SAVED } from "../../types/protocol.js";

const FLUSH_INTERVAL_MS = 1_000;

interface RoomSchedulerState {
  pendingDeltas: Uint8Array[];
  flushTimer: ReturnType<typeof setInterval>;
}

const schedulers = new Map<string, RoomSchedulerState>();

async function flushPendingDeltas(
  roomId: string,
  state: RoomSchedulerState,
): Promise<void> {
  if (state.pendingDeltas.length === 0) return;

  const toFlush = state.pendingDeltas.splice(0);
  for (const delta of toFlush) {
    await appendDeltaToStream(roomId, delta);
  }
}

export function createDeltaScheduler(bus: TypedEventEmitter): void {
  // Start tracking when the room is ready (Y.Doc initialized)
  bus.on("ROOM_READY", ({ roomId }) => {
    if (schedulers.has(roomId)) return;

    const state: RoomSchedulerState = {
      pendingDeltas: [],
      flushTimer: setInterval(() => {
        void flushPendingDeltas(roomId, state);
      }, FLUSH_INTERVAL_MS),
    };
    schedulers.set(roomId, state);
  });

  // Collect DOC_UPDATED events across the entire bus.
  // Origin "redis" doesn't need re-persisting, as the origin node already persisted it.
  bus.on("DOC_UPDATED", ({ roomId, update, origin }) => {
    if (origin === "redis") return;

    const state = schedulers.get(roomId);
    if (state) {
      state.pendingDeltas.push(update);
    }
  });

  // Stop tracking when room is tearing down
  bus.on("ROOM_TEARDOWN", async ({ roomId }) => {
    const state = schedulers.get(roomId);
    if (!state) return;

    clearInterval(state.flushTimer);
    schedulers.delete(roomId);

    await flushPendingDeltas(roomId, state);
  });

  // Listen for completed compactions to broadcast SNAPSHOT_SAVED
  bus.on("SNAPSHOT_SAVED", ({ roomId, timestamp }) => {
    // Only broadcast if the room is still active in memory on this node
    if (!schedulers.has(roomId)) return;

    const msg = Buffer.alloc(9);
    msg.writeUInt8(MSG_SNAPSHOT_SAVED, 0);
    msg.writeDoubleBE(timestamp, 1);

    bus.emit("OUTBOUND_WS_BROADCAST", {
      roomId,
      message: new Uint8Array(msg),
    });
  });
}
