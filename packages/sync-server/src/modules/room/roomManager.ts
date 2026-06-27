import { TypedEventEmitter } from "../../infra";
import type { Room } from "./types";
import { incrementPresence, decrementPresence } from "./presenceHelpers";
import {
  startHeartbeat,
  stopHeartbeat,
} from "../../snapshot";
import { logger } from "../../infra";
import { WebSocket } from "ws";

const rooms = new Map<string, Room>();

export function createRoomManager(bus: TypedEventEmitter): void {
  bus.on("CLIENT_CONNECTED", async ({ roomId, connectionId, ws, claims }) => {
    let isNewRoom = false;
    let room = rooms.get(roomId);

    if (!room) {
      isNewRoom = true;
      room = {
        connections: new Set(),
        accessMode: "PUBLIC_EDIT",
      };
      rooms.set(roomId, room);

      logger.info("RoomManager", `Created room ${roomId} in memory`);
      bus.emit("ROOM_CREATED", { roomId });
    }

    room.connections.add(ws);
    await incrementPresence(roomId);
    startHeartbeat(roomId);

    if (isNewRoom) {
      // Hydrator listens to ROOM_CREATED, and it will emit HYDRATE_DOC and then ROOM_READY
      // We don't block CLIENT_CONNECTED processing on ROOM_READY here, connectionManager handles early buffering.
    } else {
      // Room already exists and is fully hydrated — emit ROOM_READY immediately so the
      // connectionManager unblocks the new client's message queue and yjsService /
      // presenceService can push the initial sync-step-1 and awareness snapshot.
      bus.emit("ROOM_READY", { roomId });
    }
  });

  bus.on("CLIENT_DISCONNECTED", async ({ roomId, connectionId, ws }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.connections.delete(ws);

    const globalCount = await decrementPresence(roomId);
    if (globalCount === 0) {
      stopHeartbeat(roomId);
      bus.emit("ROOM_TEARDOWN", { roomId });
      rooms.delete(roomId);
    } else if (room.connections.size === 0) {
      stopHeartbeat(roomId);
    }
  });

  // Outbound broadcast handler matching the old behavior
  bus.on("OUTBOUND_WS_BROADCAST", ({ roomId, message, excludeWs }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.connections.forEach((conn) => {
      if (conn !== excludeWs && conn.readyState === WebSocket.OPEN) {
        conn.send(message);
      }
    });
  });

  bus.on("OUTBOUND_WS_SEND", ({ ws, message }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  bus.on("KICK_CONNECTION", ({ ws, code, reason }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(code, reason);
    }
  });
}

// For use by other local module builders if they desperately need the raw set,
// though they should prefer emitting OUTBOUND_WS_BROADCAST.
export function getRoomState(roomId: string): Room | undefined {
  return rooms.get(roomId);
}
