import * as decoding from "lib0/decoding";
import { TypedEventEmitter } from "../../infra/eventBus.js";
import { MSG_SYNC, MSG_AWARENESS } from "../../types/protocol.js";
import { logger } from "../../infra/logger.js";

export function createProtocolHandler(bus: TypedEventEmitter): void {
  bus.on("WS_MESSAGE_RECEIVED", ({ roomId, connectionId, ws, message }) => {
    try {
      const decoder = decoding.createDecoder(message);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        // We emit to PERMITTED_SYNC_MESSAGE so that permissionHandler can filter it first
        bus.emit("INBOUND_SYNC_MESSAGE", {
          roomId,
          connectionId,
          ws,
          message,
          origin: "client",
        });
      } else if (msgType === MSG_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        bus.emit("INBOUND_AWARENESS_MESSAGE", {
          roomId,
          connectionId,
          ws,
          update,
          origin: "client",
        });
      }
    } catch (err) {
      logger.error(
        "ProtocolHandler",
        "Failed to process message:",
        err as Error,
      );
    }
  });
}
