import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { TypedEventEmitter } from "../infra/eventBus.js";
import type { TicketClaims } from "../auth/jwtVerifier.js";
import { WS_CLOSE_UNAUTHORIZED } from "../types/protocol.js";
import { randomUUID } from "node:crypto";
import { logger } from "../infra/logger.js";

const PORT = parseInt(process.env.PORT ?? "1234", 10);

export function createConnectionManager(
  bus: TypedEventEmitter,
  wss: WebSocketServer,
): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const claims = (req as IncomingMessage & { _claims?: TicketClaims })
      ._claims;
    if (!claims) {
      ws.close(WS_CLOSE_UNAUTHORIZED, "Unauthorized");
      return;
    }

    const connectionId = randomUUID();
    const roomId =
      new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname.replace(
        /^\//,
        "",
      ) || "default";

    // Buffer messages that arrive before the room is fully hydrated
    const pendingMessages: Buffer[] = [];
    let isReady = false;

    const bufferListener = (data: Buffer) => {
      if (isReady) return;
      pendingMessages.push(data);
    };
    ws.on("message", bufferListener);

    // Tell the system a client connected. RoomManager will initiate hydration.
    bus.emit("CLIENT_CONNECTED", { roomId, connectionId, ws, claims });

    const onRoomReady = (event: { roomId: string }) => {
      if (event.roomId !== roomId) return;

      // Detach readiness listener
      bus.off("ROOM_READY", onRoomReady);

      isReady = true;
      ws.off("message", bufferListener);

      // Now route messages to the bus
      ws.on("message", (data: Buffer) => {
        const message = new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        bus.emit("WS_MESSAGE_RECEIVED", { roomId, connectionId, ws, message });
      });

      // Flush any pending messages that arrived during hydration
      for (const msg of pendingMessages) {
        ws.emit("message", msg);
      }
    };

    bus.on("ROOM_READY", onRoomReady);

    ws.on("close", () => {
      bus.emit("CLIENT_DISCONNECTED", { roomId, connectionId, ws });
    });

    ws.on("error", (err) => {
      logger.error("ConnectionManager", "WebSocket error:", err);
    });
  });
}
