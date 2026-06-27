import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as Y from "yjs";
import { TypedEventEmitter } from "../../infra/eventBus.js";
import { MSG_AWARENESS } from "../../types/protocol.js";

interface PresenceState {
  awareness: awarenessProtocol.Awareness;
}

const presences = new Map<string, PresenceState>();

// Maps each WebSocket to the set of Yjs awareness clientIDs it has registered.
// Indexed by connectionId
const connectionAwarenessClients = new Map<string, Set<number>>();

export function createPresenceService(bus: TypedEventEmitter): void {
  bus.on("ROOM_READY", ({ roomId }) => {
    if (presences.has(roomId)) return;

    const doc = new Y.Doc(); // We don't modify it, awareness just needs a doc reference
    const awareness = new awarenessProtocol.Awareness(doc);

    awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: any,
      ) => {
        const changed = [...added, ...updated, ...removed];
        const updateBuf = awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          changed,
        );

        const msg = encoding.createEncoder();
        encoding.writeVarUint(msg, MSG_AWARENESS);
        encoding.writeVarUint8Array(msg, updateBuf);
        const encoded = encoding.toUint8Array(msg);

        bus.emit("AWARENESS_UPDATED", {
          roomId,
          update: updateBuf,
          origin,
        });

        bus.emit("OUTBOUND_WS_BROADCAST", {
          roomId,
          message: encoded,
          excludeWs: origin !== "redis" ? origin : undefined,
        });

        if (origin !== "redis") {
          bus.emit("CROSS_NODE_BROADCAST", {
            roomId,
            type: "awareness",
            buffer: updateBuf,
          });
        }
      },
    );

    presences.set(roomId, { awareness });
  });

  bus.on("CLIENT_CONNECTED", ({ roomId, ws }) => {
    const state = presences.get(roomId);
    if (!state) return;

    const awarenessStates = state.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          state.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      bus.emit("OUTBOUND_WS_SEND", {
        ws,
        message: encoding.toUint8Array(awarenessEncoder),
      });
    }
  });

  bus.on(
    "INBOUND_AWARENESS_MESSAGE",
    ({ roomId, connectionId, ws, update, origin }) => {
      const state = presences.get(roomId);
      if (!state) return;

      if (origin === "client" && connectionId) {
        try {
          const updateDecoder = decoding.createDecoder(update);
          const len = decoding.readVarUint(updateDecoder);
          const tracked =
            connectionAwarenessClients.get(connectionId) ?? new Set<number>();
          for (let i = 0; i < len; i++) {
            tracked.add(decoding.readVarUint(updateDecoder));
            decoding.readVarUint(updateDecoder); // clock
            decoding.readVarUint8Array(updateDecoder); // encoded state
          }
          connectionAwarenessClients.set(connectionId, tracked);
        } catch {
          // Ignored
        }
      }

      const transactionOrigin = origin === "client" ? ws : "redis";
      awarenessProtocol.applyAwarenessUpdate(
        state.awareness,
        update,
        transactionOrigin,
      );
    },
  );

  bus.on("CLIENT_DISCONNECTED", ({ roomId, connectionId }) => {
    const state = presences.get(roomId);
    if (!state) return;

    const clientIds = connectionAwarenessClients.get(connectionId);
    if (clientIds && clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        state.awareness,
        Array.from(clientIds),
        null,
      );
    }
    connectionAwarenessClients.delete(connectionId);
  });

  bus.on("ROOM_TEARDOWN", ({ roomId }) => {
    const state = presences.get(roomId);
    if (state) {
      state.awareness.destroy();
      presences.delete(roomId);
    }
  });
}
