import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { TypedEventEmitter } from "../../infra";
import { MSG_SYNC } from "../../types";
import type { WebSocket } from "ws";

interface YjsState {
  doc: Y.Doc;
}

const docs = new Map<string, YjsState>();

export function createYjsService(bus: TypedEventEmitter): void {
  bus.on("ROOM_READY", ({ roomId }) => {
    if (docs.has(roomId)) return;

    const doc = new Y.Doc();

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      // The update comes raw from Yjs. We encode it for WS transmission.
      const msg = encoding.createEncoder();
      encoding.writeVarUint(msg, MSG_SYNC);
      syncProtocol.writeUpdate(msg, update);
      const encoded = encoding.toUint8Array(msg);

      // Tell Event Bus the doc was updated
      bus.emit("DOC_UPDATED", {
        roomId,
        update, // raw delta for persistence
        origin: origin as WebSocket | "redis",
      });

      // Also tell WS to broadcast
      bus.emit("OUTBOUND_WS_BROADCAST", {
        roomId,
        message: encoded,
        excludeWs: origin !== "redis" ? (origin as WebSocket) : undefined,
      });

      // Fan out to Redis if it originated locally
      if (origin !== "redis") {
        bus.emit("CROSS_NODE_BROADCAST", {
          roomId,
          type: "doc",
          buffer: update,
        });
      }
    });

    docs.set(roomId, { doc });
  });

  bus.on("HYDRATE_DOC", ({ roomId, snapshot }) => {
    const state = docs.get(roomId);
    if (state) {
      Y.applyUpdate(state.doc, snapshot);
    }
  });

  // Listen to the filtered permitted sync message
  bus.on("PERMITTED_SYNC_MESSAGE", ({ roomId, ws, message, origin }) => {
    const state = docs.get(roomId);
    if (!state) return;

    if (origin === "redis") {
      Y.applyUpdate(state.doc, message, "redis");
      return;
    }

    const decoder = decoding.createDecoder(message);
    // Discard the MSG_SYNC prefix byte because the WebSocket message is prefixed with it.
    decoding.readVarUint(decoder);
    
    const replyEncoder = encoding.createEncoder();
    encoding.writeVarUint(replyEncoder, MSG_SYNC);

    // Provide ws or "redis" as the transaction origin
    const transactionOrigin = origin === "client" ? ws : "redis";
    syncProtocol.readSyncMessage(
      decoder,
      replyEncoder,
      state.doc,
      transactionOrigin,
    );

    if (encoding.length(replyEncoder) > 1 && ws) {
      bus.emit("OUTBOUND_WS_SEND", {
        ws,
        message: encoding.toUint8Array(replyEncoder),
      });
    }
  });

  // Handle the initial handshake for a newly connected client
  bus.on("CLIENT_CONNECTED", ({ roomId, ws }) => {
    const state = docs.get(roomId);
    if (!state) return;

    const initEncoder = encoding.createEncoder();
    encoding.writeVarUint(initEncoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(initEncoder, state.doc);

    bus.emit("OUTBOUND_WS_SEND", {
      ws,
      message: encoding.toUint8Array(initEncoder),
    });
  });

  bus.on("ROOM_TEARDOWN", ({ roomId }) => {
    const state = docs.get(roomId);
    if (state) {
      state.doc.destroy();
      docs.delete(roomId);
    }
  });
}
