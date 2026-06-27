import * as Y from "yjs";
import { readDeltasFromStream, trimStream } from "./streamHelpers.js";
import { fetchSnapshot } from "./snapshotHydrator.js";
import { saveSnapshot } from "./snapshotPersister.js";
import { deletePresenceKey } from "../room/presenceHelpers.js";
import { TypedEventEmitter } from "../../infra/eventBus.js";
import { logger } from "../../infra/logger.js";
import { getRoomState } from "../room/roomManager.js";

const COMPACTION_INTERVAL_MS = 30_000;

export async function compactRoom(
  roomId: string,
  bus?: TypedEventEmitter,
): Promise<void> {
  const deltas = await readDeltasFromStream(roomId);
  if (deltas.length === 0) {
    return;
  }

  const baseSnapshot = await fetchSnapshot(roomId);

  const mergedDoc = new Y.Doc();
  if (baseSnapshot && baseSnapshot.byteLength > 0) {
    Y.applyUpdate(mergedDoc, baseSnapshot);
  }
  for (const delta of deltas) {
    if (delta.byteLength > 0) {
      Y.applyUpdate(mergedDoc, delta);
    }
  }

  const compactedSnapshot = Y.encodeStateAsUpdate(mergedDoc);
  await saveSnapshot(roomId, compactedSnapshot);
  await trimStream(roomId);
  mergedDoc.destroy();

  if (bus) {
    bus.emit("SNAPSHOT_SAVED", { roomId, timestamp: Date.now() });
  }

  logger.info(
    "CompactionWorker",
    `Compacted ${deltas.length} delta(s) for room ${roomId}`,
  );
}

export async function triggerImmediateCompaction(
  roomId: string,
  bus?: TypedEventEmitter,
): Promise<void> {
  await compactRoom(roomId, bus);
  await deletePresenceKey(roomId);
}

export function createCompactionWorker(bus: TypedEventEmitter): void {
  // Track active rooms from bus lifecycle events so the recurring interval
  // knows which rooms to compact.
  const activeRooms = new Set<string>();
  bus.on("ROOM_READY", ({ roomId }) => activeRooms.add(roomId));
  bus.on("ROOM_TEARDOWN", async ({ roomId }) => {
    activeRooms.delete(roomId);
    await triggerImmediateCompaction(roomId, bus);
  });

  setInterval(() => {
    activeRooms.forEach((roomId) => {
      compactRoom(roomId, bus).catch((err: Error) => {
        logger.error(
          "CompactionWorker",
          `Unexpected error compacting room ${roomId}:`,
          err,
        );
      });
    });
  }, COMPACTION_INTERVAL_MS);

  logger.info(
    "CompactionWorker",
    `Started — interval ${COMPACTION_INTERVAL_MS / 1000}s`,
  );
}
